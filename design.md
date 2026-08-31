# CorePOS

### 1. Overview & Creative North Star
**Creative North Star: The Industrial Alchemist**
CorePOS is a high-contrast, editorial design system built for high-pressure, precision environments. It rejects the "soft" aesthetics of consumer apps in favor of a brutalist, command-center feel. The system utilizes intentional asymmetry—such as vertical text rotation and off-kilter grid placements—to keep the eye moving and emphasize the "kinetic" nature of the workflow. It is designed to look like a digital translation of a high-end, dark-kitchen environment: raw, hot, and efficient.

### 2. Colors
The palette is rooted in deep obsidian tones with "heat-map" accents.
*   **Primary (#FF9157):** Represents action and heat. Used for active orders, critical CTAs, and primary indicators.
*   **Tertiary (#FFE483):** Used for "Preparing" states and secondary focus, providing a high-visibility contrast against dark backgrounds.
*   **The "No-Line" Rule:** Sectioning is achieved through color blocks (e.g., `surface-container-low` vs `background`) rather than 1px borders. If a boundary is needed, use a subtle 4px border-bottom or border-left accent to provide directional cues rather than a full box.
*   **Surface Hierarchy:** Use `surface-container-lowest` (#000000) for deep-set zones like the bar seating, and `surface-container-high` for interactive cards to make them "pop" toward the user.
*   **Glass & Gradient:** Use `rgba(38, 38, 38, 0.6)` with a 20px backdrop blur for floating modifiers or quick-look panels.

### 3. Typography
The system employs a dual-font strategy to balance industrial precision with organic readability.
*   **Display & Headlines (Space Grotesk):** A geometric sans-serif used for data points and section headers. It reflects technical efficiency. 
    *   *Scale:* Large headers use **2.25rem (36px)** or **1.875rem (30px)** for immediate impact.
*   **Body & Labels (Manrope):** A modern sans-serif designed for high legibility in low-light environments.
    *   *Scale:* Standard body text at **0.875rem (14px)**, with micro-labels at **10px** for metadata like timestamps.
*   **Rhythm:** Heavy use of `uppercase` and `tracking-tighter` on labels creates a "blueprint" aesthetic.

### 4. Elevation & Depth
Kinetic Obsidian moves away from traditional drop shadows toward **Tonal Layering** and **Atmospheric Shadows**.
*   **The Layering Principle:** Depth is created by "stacking." A `surface-container-low` base houses `surface-container-high` cards. 
*   **Ambient Shadows:** Utilize `shadow-xl` with very low opacity (5% - 10%) spread across the primary color hex to create a "glow" effect rather than a shadow.
*   **Glassmorphism:** Elements meant to feel ephemeral or global (like the 86 List) use a `glass-panel` style with 20px blur to suggest they are floating above the physical workspace.

### 5. Components
*   **Table Cards:** Defined by a 4px bottom border indicating status (Primary = Occupied, Error = Attention, Secondary = Vacant).
*   **Pipeline Cards:** Use a 4px left-border "Status Bar" to indicate the stage of preparation.
*   **Buttons:** Primary buttons use a vertical gradient (`primary` to `primary-container`) to simulate a tactile, illuminated physical switch. 
*   **Navigation:** Sidebars use high-contrast active states (10% opacity primary background) and a vertical 4px right-border to mark the current location.
*   **Pills/Chips:** Use rounded-full shapes with high-contrast borders (`outline-variant/10`) for status indicators.

### 6. Do's and Don'ts
*   **Do:** Use vertical text (`writing-mode: vertical-lr`) for secondary zone identifiers to save horizontal space and add editorial flair.
*   **Do:** Use `animate-pulse` on "Attention" or "Ready" states to catch the user's eye without being intrusive.
*   **Don't:** Use standard rounded corners. Keep `roundedness` at 1 (0.25rem - 0.5rem) to maintain an industrial, sharp edge.
*   **Don't:** Use pure white for secondary text; use `on-surface-variant` (#ADAAAA) to reduce eye strain in dark environments.
*   **Do:** Preserve the "Kitchen Background" vibe by ensuring the `background` remains the darkest element in the UI.