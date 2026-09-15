// utils/plainify.js
function plainify(doc) {
  if (!doc) return doc;
  if (Array.isArray(doc)) return doc.map(plainify);
  if (!doc.toObject) return doc;

  const plain = {};
  const obj = doc.toObject();
  for (const key of Object.keys(obj)) {
    plain[key] = doc[key];
  }
  return plain;
}

module.exports = { plainify };
