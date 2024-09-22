const fs = require("node:fs");

function writeFile(fileName, fileContent) {
  return new Promise((resolve, reject) => {
    fs.writeFile(fileName, fileContent, "binary", (err) => {
      if (err) reject(err);
      resolve("File written");
    });
  });
}

module.exports = {
  writeFile,
};
