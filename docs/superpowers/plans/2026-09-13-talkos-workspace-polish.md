# TalkOS workspace polish implementation plan

1. Add failing regression tests for boundary-aware transcript joining and the initial live-session greeting/configuration.
2. Implement transcript joining and move the workspace prompt, greeting, and tools into the pre-ready session update.
3. Add failing component tests for the Markdown formatting toolbar, preview mode, simplified Sheets/Planner chrome, consistent list actions, and canvas resize affordance.
4. Implement the Markdown toolbar and safe local preview while preserving Markdown source storage and exports.
5. Simplify Sheets and Planner, standardize list headers, and make the grid conditional on chart presence.
6. Add a bounded desktop resize affordance and responsive fallback for the workspace canvas.
7. Replace the robot avatar with the abstract stateful orb and change History to vertical reveal/dismiss motion.
8. Run focused tests, full tests, lint, typecheck, build, and Impeccable checks.
9. Visually inspect desktop/mobile in light and dark themes, fix discovered issues, and repeat verification.
