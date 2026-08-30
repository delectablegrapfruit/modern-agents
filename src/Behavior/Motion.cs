using System;
using System.Drawing;

namespace AgentWrangler.Behavior
{
    /// <summary>Position and velocity of a character being moved frame by frame.</summary>
    public struct MotionState
    {
        public PointF Position;
        public PointF Velocity;

        public MotionState(PointF position, PointF velocity)
        {
            Position = position;
            Velocity = velocity;
        }

        public float Speed
        {
            get { return (float)Math.Sqrt(Velocity.X * Velocity.X + Velocity.Y * Velocity.Y); }
        }
    }

    /// <summary>
    /// Steering for the movement styles that are continuous rather than a series of hops.
    ///
    /// The character accelerates towards its target and eases off as it arrives, instead of
    /// starting and stopping at full speed. Velocity is approached rather than assigned, so
    /// a target that jumps -- the pointer crossing the screen, or the orbit switching to a
    /// different window -- produces a curve rather than a jolt.
    /// </summary>
    public static class Motion
    {
        /// <summary>Longest frame the integrator will honour, so a stall does not fling the character.</summary>
        public const float MaxFrameSeconds = 0.1f;

        /// <summary>Below this distance the target counts as reached and the character settles.</summary>
        private const float SettleDistance = 1.5f;

        /// <summary>
        /// Advances one frame towards <paramref name="target"/>.
        /// </summary>
        /// <param name="maxSpeed">Cruising speed in pixels per second.</param>
        /// <param name="responsiveness">
        /// How quickly velocity converges on what is wanted, per second. Larger is snappier;
        /// smaller feels heavier.
        /// </param>
        /// <param name="arriveRadius">Distance over which the character slows to a stop.</param>
        public static MotionState Step(MotionState current, PointF target, float maxSpeed,
                                       float responsiveness, float arriveRadius, float dt)
        {
            if (dt <= 0) return current;
            if (dt > MaxFrameSeconds) dt = MaxFrameSeconds;
            if (arriveRadius < 1f) arriveRadius = 1f;

            float dx = target.X - current.Position.X;
            float dy = target.Y - current.Position.Y;
            float distance = (float)Math.Sqrt(dx * dx + dy * dy);

            PointF wanted;
            if (distance < SettleDistance)
            {
                wanted = new PointF(0f, 0f);
            }
            else
            {
                // Ease down over the last stretch rather than stopping dead on arrival.
                float speed = distance < arriveRadius ? maxSpeed * (distance / arriveRadius) : maxSpeed;
                wanted = new PointF(dx / distance * speed, dy / distance * speed);
            }

            // Exponential approach: framerate-independent, and it never overshoots the
            // velocity it is aiming for however long the frame was.
            float blend = 1f - (float)Math.Exp(-responsiveness * dt);

            var velocity = new PointF(
                current.Velocity.X + (wanted.X - current.Velocity.X) * blend,
                current.Velocity.Y + (wanted.Y - current.Velocity.Y) * blend);

            var position = new PointF(
                current.Position.X + velocity.X * dt,
                current.Position.Y + velocity.Y * dt);

            return new MotionState(position, velocity);
        }

        /// <summary>Moves a value a fraction of the way towards another, framerate-independent.</summary>
        public static float Approach(float current, float target, float rate, float dt)
        {
            if (dt <= 0) return current;
            if (dt > MaxFrameSeconds) dt = MaxFrameSeconds;
            float blend = 1f - (float)Math.Exp(-rate * dt);
            return current + (target - current) * blend;
        }

        public static PointF Approach(PointF current, PointF target, float rate, float dt)
        {
            return new PointF(Approach(current.X, target.X, rate, dt),
                              Approach(current.Y, target.Y, rate, dt));
        }
    }
}
