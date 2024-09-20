const fs = require("node:fs");

function getImage(homey, imageDriver, image_key) {
  // const widthSetting = Homey.ManagerSettings.get("coverArtWidth");
  // const heightSetting = Homey.ManagerSettings.get("coverArtHeight");

  // TODO: refactor this
  let width = 720;
  let height = 720;

  // try {
  //   width = Number(widthSetting);
  //   height = Number(heightSetting);
  // } catch (err) {
  //   width = 720;
  //   height = 720;
  // }
  //
  // if (width === 0) width = 720;
  // if (height === 0) height = 720;

  return new Promise((resolve, reject) => {});
}

function writeFile(fileName, fileContent) {
  return new Promise((resolve, reject) => {
    fs.writeFile(fileName, fileContent, "binary", (err) => {
      if (err) reject(err);
      resolve("File written");
    });
  });
}

function getIpAddress() {
  // get ip address
  const ifaces = require("os").networkInterfaces();
  let address = "";

  Object.keys(ifaces).forEach((dev) => {
    ifaces[dev].filter((details) => {
      if (details.family === "IPv4" && details.internal === false) {
        address = details.address;
      }
    });
  });
  return address;
}

module.exports = {
  getImage,
  writeFile,
  getIpAddress,
};
