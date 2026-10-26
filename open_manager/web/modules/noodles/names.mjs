export const LINK_STYLES = [
  { value: "solid", text: "Solid" },
  { value: "energy", text: "Energy conduit" },
  { value: "dashes", text: "Flowing dashes" },
  { value: "chain", text: "Chain" },
  { value: "rust", text: "Rusty chain" },
  { value: "pipes", text: "Pipes" },
  { value: "cord", text: "Fabric cord" },
  { value: "rope", text: "Rope" },
  { value: "beads", text: "Beads" },
  { value: "arc", text: "Electric arc" },
];

export const LINK_STYLE_IDS = new Set(LINK_STYLES.map((one) => one.value));

export const MOVING_STYLES = new Set(["energy", "dashes", "arc"]);

export const LINK_PATHS = [
  { value: "comfy", text: "Link Render Mode" },
  { value: "circuit", text: "Circuit board" },
  { value: "physics", text: "Physics" },
];
