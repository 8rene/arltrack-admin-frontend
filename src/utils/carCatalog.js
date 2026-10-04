import { collection, getDocs } from "firebase/firestore";
import { db } from "../fireabase";

// cars / brand / model / carImages are re-read in full by every tracking page
// each time it opens. They change rarely, so keep one shared copy for a few
// minutes (module-level: survives page-to-page navigation, resets on reload)
// and share a single in-flight request between components.

const TTL_MS = 5 * 60 * 1000;

let core = null;        // { cars, brandMap, modelMap }
let coreAt = 0;
let coreInflight = null;

let images = null;      // { [carID]: imageURL }
let imagesAt = 0;
let imagesInflight = null;

const fresh = (at) => Date.now() - at < TTL_MS;

async function loadCore() {
  const [carsSnap, brandSnap, modelSnap] = await Promise.all([
    getDocs(collection(db, "cars")),
    getDocs(collection(db, "brand")),
    getDocs(collection(db, "model")),
  ]);
  return {
    cars: carsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    brandMap: Object.fromEntries(brandSnap.docs.map((d) => [d.id, d.data().brandName || ""])),
    modelMap: Object.fromEntries(modelSnap.docs.map((d) => [d.id, d.data().modelName || ""])),
  };
}

async function loadImages() {
  const snap = await getDocs(collection(db, "carImages"));
  const map = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (data.carID) map[data.carID] = data.imageURL;
  });
  return map;
}

/** Drop the cached copy (e.g. right after editing a car). */
export function invalidateCarCatalog() { core = null; images = null; }

/**
 * @param {{force?: boolean, withImages?: boolean}} [opts]
 * @returns {Promise<{cars: object[], brandMap: object, modelMap: object, imgMap: object}>}
 */
export async function getCarCatalog({ force = false, withImages = false } = {}) {
  if (force) invalidateCarCatalog();

  if (!core || !fresh(coreAt)) {
    if (!coreInflight) {
      coreInflight = loadCore()
        .then((c) => { core = c; coreAt = Date.now(); return c; })
        .finally(() => { coreInflight = null; });
    }
    await coreInflight;
  }

  let imgMap = {};
  if (withImages) {
    if (!images || !fresh(imagesAt)) {
      if (!imagesInflight) {
        imagesInflight = loadImages()
          .then((m) => { images = m; imagesAt = Date.now(); return m; })
          .finally(() => { imagesInflight = null; });
      }
      await imagesInflight;
    }
    imgMap = images || {};
  }
  return { ...core, imgMap };
}