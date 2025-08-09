// Optional logger can be set from outside
let logger = console.log; // Default to console.log for backwards compatibility

const setLogger = (logFunction) => {
  logger = logFunction || console.log;
};

const promisify = (fn, ctx) => (options) =>
  new Promise((resolve, reject) => {
    fn.call(ctx, options, (err, data) => (err ? reject(err) : resolve(data)));
  });

const browseAsync = (browse, options) => {
  logger(
    "[ROON-API] browse.browse() called with:",
    JSON.stringify(options, null, 2),
  );
  return promisify(
    browse.browse,
    browse,
  )(options)
    .then((result) => {
      logger(
        "[ROON-API] browse.browse() response:",
        JSON.stringify(result, null, 2),
      );
      return result;
    })
    .catch((error) => {
      logger("[ROON-API] browse.browse() ERROR:", error.message || error);
      throw error;
    });
};

const loadAsync = (browse, options) => {
  logger(
    "[ROON-API] browse.load() called with:",
    JSON.stringify(options, null, 2),
  );
  return promisify(
    browse.load,
    browse,
  )(options)
    .then((result) => {
      logger(
        "[ROON-API] browse.load() response:",
        JSON.stringify(result, null, 2),
      );
      return result;
    })
    .catch((error) => {
      logger("[ROON-API] browse.load() ERROR:", error.message || error);
      throw error;
    });
};

const browseAndLoadAllHierarchy = async (browse, hierarchy) => {
  // check if the hierarchy exists
  if (
    !["artists", "internet_radio", "playlists", "genres", "composers"].includes(
      hierarchy,
    )
  ) {
    throw new Error(`Invalid hierarchy: ${hierarchy}`);
  }
  const { list } = await browseAsync(browse, { hierarchy, pop_all: true });
  return loadAsync(browse, { hierarchy, count: list.count });
};

const browseAndLoadItem = async (browse, hierarchy, item_key) => {
  const { list } = await browseAsync(browse, { hierarchy, item_key });
  return loadAsync(browse, { hierarchy, count: list.count });
};

const browseAndLoadItemLevel = async (browse, hierarchy, item_key, level) => {
  const { list } = await browseAsync(browse, { hierarchy, item_key });
  return loadAsync(browse, { hierarchy, level, count: list.count });
};

const browseZoneOrOutput = async (
  browse,
  hierarchy,
  zone_or_output_id,
  item_key,
) => {
  await browseAsync(browse, { hierarchy, zone_or_output_id, item_key });
};

module.exports = {
  setLogger,
  browseAsync,
  loadAsync,
  browseAndLoadAllHierarchy,
  browseAndLoadItem,
  browseAndLoadItemLevel,
  browseZoneOrOutput,
};
