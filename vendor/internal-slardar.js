var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/slardar.ts
var GLOBAL_NAME = "KSlardarWeb";
function getSlardarInstance() {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const instance = window[GLOBAL_NAME];
    if (typeof instance === "function") {
      return instance;
    }
    return null;
  } catch {
    return null;
  }
}
__name(getSlardarInstance, "getSlardarInstance");
var slardar = {
  sendLog(options) {
    try {
      const instance = getSlardarInstance();
      if (!instance) return;
      instance("sendLog", {
        content: options.content,
        level: options.level ?? "info",
        extra: {
          ...options.extra,
          team: "miaoda-sdk"
        }
      });
    } catch {
    }
  },
  sendEvent(options) {
    try {
      const instance = getSlardarInstance();
      if (!instance) return;
      instance("sendEvent", {
        name: options.name,
        metrics: options.metrics,
        categories: {
          ...options.categories,
          team: "miaoda-sdk"
        }
      });
    } catch {
    }
  },
  captureException(error, extra) {
    try {
      const instance = getSlardarInstance();
      if (!instance) return;
      instance("captureException", error, {
        ...extra,
        team: "miaoda-sdk"
      });
    } catch {
    }
  }
};
export {
  slardar
};
//# sourceMappingURL=index.js.map