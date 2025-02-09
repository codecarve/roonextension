const browseArtists = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse({ hierarchy: "artists", pop_all: true }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   action: 'list',
      //   list: {
      //     level: 0,
      //     title: 'Artists',
      //     subtitle: null,
      //     image_key: null,
      //     count: 583,
      //     display_offset: null
      // }
      //}
      resolve(body);
    });
  });
};

const browseInternetRadios = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse(
      { hierarchy: "internet_radio", pop_all: true },
      (error, body) => {
        if (error) {
          return reject(new Error(error));
        }
        // {
        //   action: 'list',
        //   list: {
        //     level: 0,
        //     title: 'Artists',
        //     subtitle: null,
        //     image_key: null,
        //     count: 583,
        //     display_offset: null
        // }
        //}
        resolve(body);
      },
    );
  });
};

const browsePlaylists = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse({ hierarchy: "playlists", pop_all: true }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   action: 'list',
      //   list: {
      //     level: 0,
      //     title: 'Artists',
      //     subtitle: null,
      //     image_key: null,
      //     count: 583,
      //     display_offset: null
      // }
      //}
      resolve(body);
    });
  });
};

const browseGenres = async (browse) => {
  return new Promise((resolve, reject) => {
    browse.browse({ hierarchy: "genres", pop_all: true }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   action: 'list',
      //   list: {
      //     level: 0,
      //     title: 'Artists',
      //     subtitle: null,
      //     image_key: null,
      //     count: 583,
      //     display_offset: null
      // }
      //}
      console.log(`resolving with body: ${JSON.stringify(body, null, 2)}`);
      resolve(body);
    });
  });
};

const loadArtists = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "artists", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const loadInternetRadios = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load(
      { hierarchy: "internet_radio", count: +count },
      (error, body) => {
        if (error) {
          return reject(new Error(error));
        }
        // {
        //   items: [
        //     {
        //       title: '‘Papa’ John DeFrancesco',
        //       subtitle: '1 Album',
        //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
        //       item_key: '1:0',
        //       hint: 'list'
        //     },
        //
        resolve(body);
      },
    );
  });
};

const loadPlaylists = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "playlists", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const loadGenres = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "genres", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const loadComposers = async (browse, count) => {
  return new Promise((resolve, reject) => {
    browse.load({ hierarchy: "composers", count: +count }, (error, body) => {
      if (error) {
        return reject(new Error(error));
      }
      // {
      //   items: [
      //     {
      //       title: '‘Papa’ John DeFrancesco',
      //       subtitle: '1 Album',
      //       image_key: '8105e6c949f3be39d01f434a15ddcdb2',
      //       item_key: '1:0',
      //       hint: 'list'
      //     },
      //
      resolve(body);
    });
  });
};

const browseAndLoadAllArtists = async (browse) => {
  const browseResult = await browseArtists(browse);
  console.log("browseResult: ", browseResult);
  return await loadArtists(browse, browseResult.list.count);
};

const browseAndLoadAllInternetRadios = async (browse) => {
  const browseResult = await browseInternetRadios(browse);
  return await loadInternetRadios(browse, browseResult.list.count);
};

const browseAndLoadAllPlaylists = async (browse) => {
  const browseResult = await browsePlaylists(browse);
  return await loadPlaylists(browse, browseResult.list.count);
};

const browseAndLoadAllGenres = async (browse) => {
  console.log(`inside browseAndLoadAllGenres`);
  const browseResult = await browseGenres(browse);
  return await loadGenres(browse, browseResult.list.count);
};

const browseAndLoadAllComposers = async (browse) => {
  console.log(`inside browseAndLoadAllComposers`);
  const browseResult = await browseGenres(browse);
  return await loadComposers(browse, browseResult.list.count);
};

module.exports = {
  browseAndLoadAllArtists,
  browseAndLoadAllInternetRadios,
  browseAndLoadAllPlaylists,
  browseAndLoadAllGenres,
  browseAndLoadAllComposers,
};
