using System;
using System.Windows.Forms;

namespace AgentWrangler.Ui
{
    /// <summary>
    /// Sizing rules for the manager's splitter, kept apart from the window so the
    /// arithmetic can be tested without a desktop.
    ///
    /// SplitContainer validates Panel1MinSize, Panel2MinSize and SplitterDistance against
    /// the control's *current* width, and a freshly constructed SplitContainer is 150
    /// pixels wide. Assigning a minimum bigger than that cascades into an internal
    /// SplitterDistance assignment that fails its own validation, and the exception escapes
    /// the constructor long before the form has ever been laid out. So the control is given
    /// a real size first, and every value assigned afterwards is one the current width can
    /// actually accommodate.
    /// </summary>
    internal static class SplitterLayout
    {
        /// <summary>Narrowest useful width for the character list.</summary>
        public const int Panel1Min = 260;

        /// <summary>Narrowest useful width for the tabs.</summary>
        public const int Panel2Min = 320;

        /// <summary>Where the splitter sits when there is room for it.</summary>
        public const int Preferred = 380;

        /// <summary>Whether both panels can hold their minimum at this width.</summary>
        public static bool FitsIn(int width, int splitterWidth)
        {
            return width - splitterWidth >= Panel1Min + Panel2Min;
        }

        /// <summary>
        /// The splitter position to use at this width: the preferred one where it fits,
        /// otherwise as close as the two minimums allow.
        /// </summary>
        public static int Distance(int width, int splitterWidth)
        {
            int highest = width - splitterWidth - Panel2Min;
            if (highest < Panel1Min) return Panel1Min;

            int wanted = Preferred < Panel1Min ? Panel1Min : Preferred;
            return wanted > highest ? highest : wanted;
        }

        /// <summary>
        /// Applies the minimums and the splitter position, in an order every intermediate
        /// state of which is valid. Does nothing if the control is still too narrow to hold
        /// both minimums, which is the case for a SplitContainer that has not been sized.
        /// </summary>
        public static void Apply(SplitContainer split)
        {
            if (split == null) return;
            if (!FitsIn(split.Width, split.SplitterWidth))
            {
                Diagnostics.Warn("Splitter left at its default: only " + split.Width + " pixels available.");
                return;
            }

            try
            {
                split.Panel1MinSize = Panel1Min;
                split.Panel2MinSize = Panel2Min;
                split.SplitterDistance = Distance(split.Width, split.SplitterWidth);
            }
            catch (ArgumentOutOfRangeException ex)
            {
                // Never fatal: a splitter in the wrong place is only cosmetic.
                Diagnostics.Warn("Could not position the splitter: " + ex.Message);
            }
            catch (InvalidOperationException ex)
            {
                Diagnostics.Warn("Could not position the splitter: " + ex.Message);
            }
        }
    }
}
