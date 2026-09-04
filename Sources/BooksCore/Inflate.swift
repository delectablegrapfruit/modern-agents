import Foundation

/// DEFLATE (RFC 1951) decoder with the zlib (RFC 1950) wrapper, written in plain Swift so EPUB and Kindle files can
/// be read without any platform library. Modelled on zlib's reference `puff`: canonical Huffman codes decoded a bit
/// at a time, which is plenty for the few megabytes a book takes.
public enum Inflate {
    public enum Error: Swift.Error, CustomStringConvertible {
        case truncated
        case invalidBlockType
        case invalidStoredLength
        case invalidCodeLengths
        case invalidCode
        case distanceTooFar
        case badZlibHeader

        public var description: String {
            switch self {
            case .truncated: return "compressed data ends early"
            case .invalidBlockType: return "invalid deflate block type"
            case .invalidStoredLength: return "invalid stored block length"
            case .invalidCodeLengths: return "invalid Huffman code lengths"
            case .invalidCode: return "invalid Huffman code"
            case .distanceTooFar: return "back-reference before the start of the output"
            case .badZlibHeader: return "not a zlib stream"
            }
        }
    }

    /// Inflates a raw deflate stream (what ZIP entries and the Kindle FONT records use).
    public static func raw(_ data: Data, expectedSize: Int = 0) throws -> Data {
        var decoder = Decoder(bytes: [UInt8](data), expectedSize: expectedSize)
        try decoder.run()
        return Data(decoder.output)
    }

    /// Inflates a zlib stream: a two-byte header, deflate data, and an Adler-32 checksum that is not verified.
    public static func zlib(_ data: Data) throws -> Data {
        guard data.count >= 2 else { throw Error.badZlibHeader }
        let cmf = data[data.startIndex], flg = data[data.startIndex + 1]
        guard cmf & 0x0F == 8, (UInt16(cmf) << 8 | UInt16(flg)) % 31 == 0, flg & 0x20 == 0 else { throw Error.badZlibHeader }
        return try raw(data.dropFirst(2))
    }

    // MARK: - Decoder

    private struct Huffman {
        var count = [Int](repeating: 0, count: 16)
        var symbol: [Int]

        /// Builds the canonical code from code lengths; returns false when the lengths are not a valid (complete or
        /// incomplete-but-single) code.
        init(lengths: [Int]) throws {
            symbol = [Int](repeating: 0, count: lengths.count)
            for length in lengths { count[length] += 1 }
            if count[0] == lengths.count { return } // no codes at all: legal, never used
            var left = 1
            for len in 1..<16 {
                left <<= 1
                left -= count[len]
                if left < 0 { throw Error.invalidCodeLengths } // over-subscribed
            }
            var offsets = [Int](repeating: 0, count: 16)
            for len in 1..<15 { offsets[len + 1] = offsets[len] + count[len] }
            for (index, length) in lengths.enumerated() where length != 0 {
                symbol[offsets[length]] = index
                offsets[length] += 1
            }
        }
    }

    private struct Decoder {
        let bytes: [UInt8]
        var position = 0
        var bitBuffer = 0
        var bitCount = 0
        var output: [UInt8] = []

        static let lengthBase = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258]
        static let lengthExtra = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0]
        static let distanceBase = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577]
        static let distanceExtra = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13]
        static let codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15]
        static let fixedLiteral: Huffman = {
            var lengths = [Int](repeating: 8, count: 288)
            for i in 144..<256 { lengths[i] = 9 }
            for i in 256..<280 { lengths[i] = 7 }
            return try! Huffman(lengths: lengths)
        }()
        static let fixedDistance: Huffman = try! Huffman(lengths: [Int](repeating: 5, count: 30))

        init(bytes: [UInt8], expectedSize: Int) {
            self.bytes = bytes
            output.reserveCapacity(expectedSize > 0 ? expectedSize : min(bytes.count * 4, 64 << 20))
        }

        mutating func bits(_ need: Int) throws -> Int {
            var value = bitBuffer
            while bitCount < need {
                guard position < bytes.count else { throw Error.truncated }
                value |= Int(bytes[position]) << bitCount
                position += 1
                bitCount += 8
            }
            bitBuffer = value >> need
            bitCount -= need
            return value & ((1 << need) - 1)
        }

        mutating func decode(_ h: Huffman) throws -> Int {
            var code = 0, first = 0, index = 0
            for len in 1..<16 {
                code |= try bits(1)
                let count = h.count[len]
                if code - count < first { return h.symbol[index + (code - first)] }
                index += count
                first += count
                first <<= 1
                code <<= 1
            }
            throw Error.invalidCode
        }

        mutating func run() throws {
            var last = false
            repeat {
                last = try bits(1) == 1
                switch try bits(2) {
                case 0: try stored()
                case 1: try codes(literal: Decoder.fixedLiteral, distance: Decoder.fixedDistance)
                case 2: try dynamic()
                default: throw Error.invalidBlockType
                }
            } while !last
        }

        mutating func stored() throws {
            bitBuffer = 0
            bitCount = 0
            guard position + 4 <= bytes.count else { throw Error.truncated }
            let length = Int(bytes[position]) | Int(bytes[position + 1]) << 8
            let complement = Int(bytes[position + 2]) | Int(bytes[position + 3]) << 8
            guard length == (~complement & 0xFFFF) else { throw Error.invalidStoredLength }
            position += 4
            guard position + length <= bytes.count else { throw Error.truncated }
            output.append(contentsOf: bytes[position..<position + length])
            position += length
        }

        mutating func dynamic() throws {
            let nlen = try bits(5) + 257, ndist = try bits(5) + 1, ncode = try bits(4) + 4
            guard nlen <= 286, ndist <= 30 else { throw Error.invalidCodeLengths }
            var lengths = [Int](repeating: 0, count: 19)
            for i in 0..<ncode { lengths[Decoder.codeLengthOrder[i]] = try bits(3) }
            let lencode = try Huffman(lengths: lengths)
            var all = [Int](repeating: 0, count: nlen + ndist)
            var index = 0
            while index < nlen + ndist {
                var symbol = try decode(lencode)
                if symbol < 16 {
                    all[index] = symbol
                    index += 1
                } else {
                    var repeatLength = 0
                    if symbol == 16 {
                        guard index > 0 else { throw Error.invalidCodeLengths }
                        repeatLength = all[index - 1]
                        symbol = try 3 + bits(2)
                    } else if symbol == 17 {
                        symbol = try 3 + bits(3)
                    } else {
                        symbol = try 11 + bits(7)
                    }
                    guard index + symbol <= nlen + ndist else { throw Error.invalidCodeLengths }
                    for _ in 0..<symbol { all[index] = repeatLength; index += 1 }
                }
            }
            guard all[256] != 0 else { throw Error.invalidCodeLengths }
            let literal = try Huffman(lengths: Array(all[0..<nlen]))
            let distance = try Huffman(lengths: Array(all[nlen..<nlen + ndist]))
            try codes(literal: literal, distance: distance)
        }

        mutating func codes(literal: Huffman, distance: Huffman) throws {
            while true {
                let symbol = try decode(literal)
                if symbol < 256 {
                    output.append(UInt8(symbol))
                } else if symbol == 256 {
                    return
                } else {
                    let li = symbol - 257
                    guard li < 29 else { throw Error.invalidCode }
                    let length = try Decoder.lengthBase[li] + bits(Decoder.lengthExtra[li])
                    let ds = try decode(distance)
                    guard ds < 30 else { throw Error.invalidCode }
                    let dist = try Decoder.distanceBase[ds] + bits(Decoder.distanceExtra[ds])
                    guard dist <= output.count else { throw Error.distanceTooFar }
                    let start = output.count - dist
                    if dist >= length {
                        output.append(contentsOf: output[start..<start + length])
                    } else {
                        for i in 0..<length { output.append(output[start + i]) }
                    }
                }
            }
        }
    }
}

/// CRC-32 as ZIP uses it.
public enum CRC32 {
    private static let table: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i)
        for _ in 0..<8 { c = (c & 1) == 1 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    public static func checksum(_ data: Data) -> UInt32 {
        var c: UInt32 = 0xFFFF_FFFF
        for byte in data { c = table[Int((c ^ UInt32(byte)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }
}
