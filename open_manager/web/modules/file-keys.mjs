const FILE_WORDS = {
  image: "Image", video: "Video", audio: "Audio", model: "Model", text: "Text",
  other: "File",
};

const FILE_MOVE_TYPE = "application/x-om-hostfile";

const FILE_PIN = "files:";

function filePinKey(place, path) {
  return `${FILE_PIN}${encodeURIComponent(`${place}|${path || ""}`)}`;
}

function filePinParts(key) {
  if (!key.startsWith(FILE_PIN)) return null;
  let text = "";
  try {
    text = decodeURIComponent(key.slice(FILE_PIN.length));
  } catch {
    return null;
  }
  const at = text.lastIndexOf("|");
  if (at < 0) return null;
  return { place: text.slice(0, at), path: text.slice(at + 1) };
}

export { FILE_WORDS, FILE_MOVE_TYPE, filePinKey, filePinParts };
