const fs = require("node:fs");
const { promisify } = require("util");

const writeFile = promisify(fs.writeFile);

async function saveImage(filePath, fileContent) {
  try {
    await writeFile(filePath, fileContent, "binary");
    return "Image saved successfully";
  } catch (error) {
    throw new Error(`Failed to save image. Error: ${error.message}`);
  }
}

async function createAlbumArtImage(homey, imagePath) {
  const albumArtImage = await homey.images.createImage();
  if (albumArtImage) {
    albumArtImage.setPath(imagePath);
    return albumArtImage;
  } else {
    throw new Error("Failed to create album art image");
  }
}

async function fetchAndSaveImage(imageDriver, imageKey, filePath) {
  try {
    const buffer = await new Promise((resolve, reject) => {
      imageDriver.get_image(
        imageKey,
        { format: "image/jpeg" },
        (err, _, buffer) => {
          if (err) return reject(err);
          resolve(buffer);
        },
      );
    });
    await saveImage(filePath, buffer);
    return buffer;
  } catch (error) {
    throw new Error(`Failed to fetch and save image. Error: ${error.message}`);
  }
}

module.exports = {
  saveImage,
  createAlbumArtImage,
  fetchAndSaveImage,
};
