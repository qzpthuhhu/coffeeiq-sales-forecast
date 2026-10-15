var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// —— 内联 internal-slardar.js（原 internal-slardar.js 模块）——
// 原因：妙搭发布后主 SDK 被重写到签名 CDN，内部相对 import ./internal-slardar.js
// 会被解析到无签名的 CDN 路径并被 403 拒绝。内联后消除此依赖，保持 SDK 行为不变。
// slardar 在 window.KSlardarWeb 不存在时为 no-op，不影响功能。
var SLARDAR_GLOBAL_NAME = "KSlardarWeb";
function getSlardarInstance() {
  try {
    if (typeof window === "undefined") {
      return null;
    }
    const instance = window[SLARDAR_GLOBAL_NAME];
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
// slardar2 是 IframeManager 模块中使用的别名（原 import { slardar as slardar2 }）
var slardar2 = slardar;

// src/constants.ts
var MESSAGE_BIZ_ID = "cui-sdk-message";
var PARENT_ORIGIN_QUERY_KEY = "__parentOrigin";
var IFRAME_ORIGIN = {
  production: "https://aily.feishu.cn",
  staging: "https://aily.feishu-pre.cn",
  boe: "https://aily.feishu-boe.cn",
  development: "http://localhost:8080"
};
var CHAT_IFRAME_PATH = "/cui";
var AGENT_IFRAME_PATH = "/custom_agent/cui";
var IFRAME_BASE_URL = {
  production: `${IFRAME_ORIGIN.production}${CHAT_IFRAME_PATH}`,
  staging: `${IFRAME_ORIGIN.staging}${CHAT_IFRAME_PATH}`,
  boe: `${IFRAME_ORIGIN.boe}${CHAT_IFRAME_PATH}`,
  development: `${IFRAME_ORIGIN.development}${CHAT_IFRAME_PATH}`
};
var AGENT_IFRAME_BASE_URL = {
  production: `${IFRAME_ORIGIN.production}${AGENT_IFRAME_PATH}`,
  staging: `${IFRAME_ORIGIN.staging}${AGENT_IFRAME_PATH}`,
  boe: `${IFRAME_ORIGIN.boe}${AGENT_IFRAME_PATH}`,
  development: `${IFRAME_ORIGIN.development}${AGENT_IFRAME_PATH}`
};
function isIframeEnv(env) {
  return Boolean(env && env in IFRAME_BASE_URL);
}
__name(isIframeEnv, "isIframeEnv");
function resolveDebugIframeEnv() {
  if (typeof window === "undefined") {
    return void 0;
  }
  const debugIframeEnv = window.__DEBUG__?.ailyWebSdk?.iframeEnv;
  return isIframeEnv(debugIframeEnv) ? debugIframeEnv : void 0;
}
__name(resolveDebugIframeEnv, "resolveDebugIframeEnv");
function resolveIframeEnv(env) {
  if (isIframeEnv(env)) {
    return env;
  }
  const debugIframeEnv = resolveDebugIframeEnv();
  if (debugIframeEnv) {
    return debugIframeEnv;
  }
  const hostname = typeof window !== "undefined" ? window.location.hostname : "";
  if (hostname.includes("aiforce-boe")) {
    return "boe";
  }
  if (hostname.includes("aiforce-pre") || hostname.includes("force-pre.feishuapp.net") || hostname.includes("fsapp.kundou.cn")) {
    return "staging";
  }
  return "production";
}
__name(resolveIframeEnv, "resolveIframeEnv");
function getIframeBaseURL(env) {
  return IFRAME_BASE_URL[resolveIframeEnv(env)];
}
__name(getIframeBaseURL, "getIframeBaseURL");
function getAgentIframeBaseURL(env) {
  return AGENT_IFRAME_BASE_URL[resolveIframeEnv(env)];
}
__name(getAgentIframeBaseURL, "getAgentIframeBaseURL");
var MESSAGE_TIMEOUT = 30 * 1e3;
var DEFAULT_CHANNEL_TYPE = "MIAODA_CUI_SDK";
var DEFAULT_ANONYMOUS_CHANNEL_TYPE = "MIAODA_ANONYMOUS_CUI_SDK";
var ALLOWED_ORIGINS = [
  IFRAME_ORIGIN.production,
  IFRAME_ORIGIN.staging,
  IFRAME_ORIGIN.boe,
  "http://localhost:3000",
  "http://localhost:5173",
  IFRAME_ORIGIN.development
];

// src/iframe-manager.ts

// src/device-detector.ts
var MOBILE_BREAKPOINT = 768;
var _DeviceDetector = class _DeviceDetector {
  constructor() {
    __publicField(this, "mediaQuery");
    __publicField(this, "currentDevice");
    __publicField(this, "callback", null);
    __publicField(this, "handleChange", null);
    this.mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    this.currentDevice = window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "pc";
  }
  getDevice() {
    return this.currentDevice;
  }
  observe(callback) {
    this.callback = callback;
    this.handleChange = () => {
      const newDevice = window.innerWidth < MOBILE_BREAKPOINT ? "mobile" : "pc";
      if (newDevice !== this.currentDevice) {
        this.currentDevice = newDevice;
        this.callback?.(newDevice);
      }
    };
    this.mediaQuery.addEventListener("change", this.handleChange);
  }
  destroy() {
    if (this.handleChange) {
      this.mediaQuery.removeEventListener("change", this.handleChange);
      this.handleChange = null;
    }
    this.callback = null;
  }
};
__name(_DeviceDetector, "DeviceDetector");
var DeviceDetector = _DeviceDetector;

// src/message-bridge.ts
var _MessageBridge = class _MessageBridge {
  constructor(targetOrigin) {
    __publicField(this, "iframe", null);
    __publicField(this, "requestId", 0);
    __publicField(this, "pendingRequests", /* @__PURE__ */ new Map());
    __publicField(this, "eventHandlers", /* @__PURE__ */ new Map());
    __publicField(this, "targetOrigin");
    this.targetOrigin = new URL(targetOrigin).origin;
    this.handleMessage = this.handleMessage.bind(this);
  }
  /**
  * Attach to an iframe and start listening for messages
  */
  attach(iframe) {
    this.iframe = iframe;
    window.addEventListener("message", this.handleMessage);
  }
  /**
  * Detach from iframe and clean up
  */
  detach() {
    window.removeEventListener("message", this.handleMessage);
    this.iframe = null;
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error("MessageBridge detached"));
    });
    this.pendingRequests.clear();
  }
  /**
  * Send a message to the iframe and wait for response
  */
  send(type, data) {
    return new Promise((resolve, reject) => {
      if (!this.iframe?.contentWindow) {
        reject(new Error("Iframe not attached"));
        return;
      }
      this.requestId += 1;
      const id = this.requestId;
      const message = {
        messageBizId: MESSAGE_BIZ_ID,
        id,
        type,
        data,
        timestamp: Date.now(),
        isRequest: true
      };
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        const error = new Error(`Message timeout: ${type}`);
        slardar.captureException(error, {
          source: "aily-web-sdk",
          module: "message-bridge",
          messageType: type
        });
        reject(error);
      }, MESSAGE_TIMEOUT);
      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer
      });
      this.iframe.contentWindow.postMessage(message, this.targetOrigin);
    });
  }
  /**
  * Register an event handler
  */
  onEvent(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);
  }
  /**
  * Remove an event handler
  */
  offEvent(eventName, handler) {
    const handlers = this.eventHandlers.get(eventName) || [];
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
      this.eventHandlers.set(eventName, handlers);
    }
  }
  handleMessage(event) {
    if (!ALLOWED_ORIGINS.includes(event.origin)) {
      return;
    }
    const { data } = event;
    if (data?.messageBizId !== MESSAGE_BIZ_ID) {
      return;
    }
    if (this.isResponseMessage(data)) {
      const pending = this.pendingRequests.get(data.id);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(data.id);
        if (data.error) {
          const error = new Error(data.error.message);
          slardar.captureException(error, {
            source: "aily-web-sdk",
            module: "message-bridge",
            errorCode: data.error.code
          });
          pending.reject(error);
        } else {
          pending.resolve(data.data);
        }
      }
    }
    if (this.isEventMessage(data)) {
      const handlers = this.eventHandlers.get(data.eventName) || [];
      handlers.forEach((handler) => {
        try {
          handler(data.data);
        } catch {
        }
      });
    }
  }
  isResponseMessage(data) {
    return "isResponse" in data && data.isResponse === true;
  }
  isEventMessage(data) {
    return data.type === "event";
  }
};
__name(_MessageBridge, "MessageBridge");
var MessageBridge = _MessageBridge;

// src/iframe-manager.ts
var _IframeManager = class _IframeManager {
  constructor(root, config) {
    __publicField(this, "iframe", null);
    __publicField(this, "messageBridge");
    __publicField(this, "config");
    __publicField(this, "channelType");
    __publicField(this, "root");
    __publicField(this, "deviceDetector", null);
    this.root = root;
    this.config = config;
    const defaultChannel = config.anonymous ? DEFAULT_ANONYMOUS_CHANNEL_TYPE : DEFAULT_CHANNEL_TYPE;
    this.channelType = config.common?.channelType || defaultChannel;
    this.messageBridge = new MessageBridge(getIframeBaseURL());
  }
  /**
  * Initialize the iframe and establish communication
  * 配置通过 URL hash 编码传入 iframe，iframe 加载后自行初始化
  */
  async init() {
    const initStart = performance.now();
    if (!this.config.device) {
      this.deviceDetector = new DeviceDetector();
      this.config.device = this.deviceDetector.getDevice();
    }
    this.iframe = document.createElement("iframe");
    this.iframe.src = this.buildIframeURL();
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";
    this.iframe.allow = "microphone; clipboard-write";
    this.root.appendChild(this.iframe);
    this.messageBridge.attach(this.iframe);
    this.setupEventHandlers();
    if (this.deviceDetector) {
      this.deviceDetector.observe((newDevice) => {
        this.messageBridge.send("updateConfig", {
          device: newDevice
        });
      });
    }
    await this.waitForReady();
    this.reportInitMetrics(initStart);
    return this.createChatPanel();
  }
  /**
  * Destroy the iframe and cleanup
  */
  async destroy() {
    try {
      await this.messageBridge.send("destroy");
    } catch {
    }
    this.messageBridge.detach();
    if (this.deviceDetector) {
      this.deviceDetector.destroy();
      this.deviceDetector = null;
    }
    if (this.iframe?.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    this.iframe = null;
  }
  /**
  * 构建 iframe URL，将配置编码到 hash 中
  * 格式: {baseURL}#{params} 其中 config 为 base64(JSON.stringify(configWithoutEvents))
  *
  * 鉴权说明：SDK 不参与 token 获取/传递。iframe 自行处理飞书登录流程，
  * 允许用户在 iframe 中独立登录。匿名渠道跳过登录检查。
  */
  buildIframeURL() {
    const baseURL = getIframeBaseURL();
    const { events: _events, anonymous: _anonymous, ...configWithoutEvents } = this.config;
    const editorConfig = configWithoutEvents.editor?.skill ? {
      ...configWithoutEvents.editor,
      skill: {
        type: "custom",
        builtinType: "unspecified",
        ...configWithoutEvents.editor.skill
      }
    } : configWithoutEvents.editor;
    const iframeConfig = {
      ...configWithoutEvents,
      common: {
        ...configWithoutEvents.common,
        channelType: this.channelType,
        resourceType: configWithoutEvents.common?.resourceType || this.channelType
      },
      editor: editorConfig
    };
    const configBase64 = btoa(encodeURIComponent(JSON.stringify(iframeConfig)));
    const params = new URLSearchParams({
      appKey: this.config.appKey,
      config: encodeURIComponent(configBase64)
    });
    return `${baseURL}#${params.toString()}`;
  }
  /**
  * 等待 iframe 自行初始化完成后发送 ready 事件
  */
  waitForReady() {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const error = new Error("Iframe ready timeout");
        slardar2.captureException(error, {
          source: "aily-web-sdk",
          module: "iframe-ready"
        });
        reject(error);
      }, 3e4);
      const checkMessage = /* @__PURE__ */ __name((event) => {
        if (event.data?.messageBizId === MESSAGE_BIZ_ID && event.data?.type === "event" && event.data?.eventName === "ready") {
          clearTimeout(timeout);
          window.removeEventListener("message", checkMessage);
          resolve();
        }
      }, "checkMessage");
      window.addEventListener("message", checkMessage);
    });
  }
  setupEventHandlers() {
    const { events } = this.config;
    if (!events) return;
    if (events.onReady) {
      this.messageBridge.onEvent("ready", events.onReady);
    }
    if (events.onError) {
      this.messageBridge.onEvent("error", (data) => {
        const msg = data?.message || "Unknown error";
        events.onError?.(new Error(msg));
      });
    }
    if (events.onMessage) {
      this.messageBridge.onEvent("onMessage", events.onMessage);
    }
    if (events.onInited) {
      this.messageBridge.onEvent("inited", events.onInited);
    }
    if (events.onInitedWithWelcome) {
      this.messageBridge.onEvent("initedWithWelcome", events.onInitedWithWelcome);
    }
    if (events.onClose) {
      this.messageBridge.onEvent("onClose", events.onClose);
    }
  }
  reportInitMetrics(initStart) {
    try {
      const cost = performance.now() - initStart;
      slardar2.sendEvent({
        name: "cui_init_total",
        metrics: {
          cost
        },
        categories: {
          arch: "iframe-static",
          appKey: this.config.appKey,
          channelType: this.channelType
        }
      });
    } catch {
    }
  }
  createChatPanel() {
    return {
      sendMessage: /* @__PURE__ */ __name(async (data) => {
        await this.messageBridge.send("sendMessage", data);
      }, "sendMessage"),
      clear: /* @__PURE__ */ __name(async () => {
        await this.messageBridge.send("clear");
      }, "clear"),
      cancelMessage: /* @__PURE__ */ __name(async (messageItem) => {
        await this.messageBridge.send("cancelMessage", messageItem);
      }, "cancelMessage"),
      clearAndStop: /* @__PURE__ */ __name(async () => {
        await this.messageBridge.send("clearAndStop");
      }, "clearAndStop"),
      updateWelcomeMessage: /* @__PURE__ */ __name(async () => {
        await this.messageBridge.send("updateWelcomeMessage");
      }, "updateWelcomeMessage"),
      updateConfig: /* @__PURE__ */ __name(async (config) => {
        await this.messageBridge.send("updateConfig", config);
      }, "updateConfig"),
      observeSkill: /* @__PURE__ */ __name(async (skillId, name, skillType) => {
        await this.messageBridge.send("observeSkill", {
          skillId,
          name,
          skillType
        });
      }, "observeSkill"),
      setCurrentSkill: /* @__PURE__ */ __name(async (skill) => {
        await this.messageBridge.send("setCurrentSkill", skill);
      }, "setCurrentSkill"),
      destroy: /* @__PURE__ */ __name(async () => {
        await this.destroy();
      }, "destroy")
    };
  }
};
__name(_IframeManager, "IframeManager");
var IframeManager = _IframeManager;

// src/agent-iframe-manager.ts
var _AgentIframeManager = class _AgentIframeManager {
  constructor(root, config) {
    __publicField(this, "iframe", null);
    __publicField(this, "messageBridge");
    __publicField(this, "config");
    __publicField(this, "root");
    __publicField(this, "runtimeCustomContext");
    __publicField(this, "contextVersion");
    __publicField(this, "initialHandshakeCompleted", false);
    __publicField(this, "handleSubsequentReady", /* @__PURE__ */ __name((data) => {
      if (!this.initialHandshakeCompleted) {
        return;
      }
      void this.sendParentContext(this.parseReadyEventData(data)).catch((error) => {
        this.warn("Failed to re-send initParentContext after iframe ready event.", error);
      });
    }, "handleSubsequentReady"));
    this.root = root;
    this.config = config;
    this.runtimeCustomContext = this.resolveRuntimeCustomContext(config);
    this.contextVersion = this.createContextVersion();
    this.messageBridge = new MessageBridge(getAgentIframeBaseURL());
  }
  async init() {
    this.iframe = document.createElement("iframe");
    this.iframe.src = this.buildIframeURL();
    this.iframe.style.width = "100%";
    this.iframe.style.height = "100%";
    this.iframe.style.border = "none";
    this.iframe.allow = "microphone; clipboard-write";
    const readyPromise = this.waitForReady();
    this.messageBridge.onEvent("ready", this.handleSubsequentReady);
    this.messageBridge.attach(this.iframe);
    this.root.appendChild(this.iframe);
    try {
      const readyData = await readyPromise;
      await this.sendParentContext(readyData);
    } catch (error) {
      this.warn("Agent SDK initialization encountered a non-blocking error. Initialization will continue without blocking the iframe lifecycle.", error);
    } finally {
      this.initialHandshakeCompleted = true;
    }
    return this.createAgentInstance();
  }
  async destroy() {
    this.messageBridge.offEvent("ready", this.handleSubsequentReady);
    try {
      await this.messageBridge.send("destroy");
    } catch {
    }
    this.messageBridge.detach();
    this.removeIframe();
    this.initialHandshakeCompleted = false;
  }
  buildIframeURL() {
    const baseURL = getAgentIframeBaseURL();
    const params = new URLSearchParams({
      channelToken: this.config.channelToken,
      [PARENT_ORIGIN_QUERY_KEY]: window.location.origin
    });
    return `${baseURL}?${params.toString()}`;
  }
  buildParentContext() {
    const parentContext = {
      parentOrigin: window.location.origin
    };
    return parentContext;
  }
  waitForReady() {
    return new Promise((resolve, reject) => {
      const handleReady = /* @__PURE__ */ __name((data) => {
        clearTimeout(timeout);
        this.messageBridge.offEvent("ready", handleReady);
        resolve(this.parseReadyEventData(data));
      }, "handleReady");
      const timeout = setTimeout(() => {
        this.messageBridge.offEvent("ready", handleReady);
        reject(new Error("Iframe ready timeout"));
      }, 3e4);
      this.messageBridge.onEvent("ready", handleReady);
    });
  }
  async sendParentContext(readyData) {
    const payload = this.buildParentContextForReady(readyData);
    let response;
    try {
      response = await this.messageBridge.send("initParentContext", payload);
    } catch (error) {
      this.warn("Failed to send initParentContext during initialization.", error);
      return;
    }
    if (!this.runtimeCustomContext) {
      return;
    }
    if (response?.accepted !== true) {
      this.warn("Iframe rejected initParentContext custom context. Custom context will be ignored for this initialization.");
      return;
    }
    if (payload.iframeSessionId && response.iframeSessionId && response.iframeSessionId !== payload.iframeSessionId) {
      this.warn("Iframe returned mismatched iframeSessionId. Custom context acknowledgement will be ignored.");
      return;
    }
    if (payload.contextVersion && response.contextVersion && response.contextVersion !== payload.contextVersion) {
      this.warn("Iframe returned mismatched contextVersion. Custom context acknowledgement will be ignored.");
    }
  }
  buildParentContextForReady(readyData) {
    const parentContext = this.buildParentContext();
    if (!this.runtimeCustomContext) {
      return parentContext;
    }
    if (!this.readySupportsRuntimeContext(readyData)) {
      this.warn("Current iframe version does not support custom context initParentContext protocol. SDK initialization will continue without custom context.");
      return parentContext;
    }
    return {
      ...parentContext,
      protocolVersion: 2,
      iframeSessionId: readyData.iframeSessionId,
      contextVersion: this.contextVersion,
      runtimeCustomContext: this.runtimeCustomContext
    };
  }
  readySupportsRuntimeContext(readyData) {
    return readyData?.protocolVersion === 2 && Boolean(readyData.iframeSessionId) && readyData.needsContext === true;
  }
  parseReadyEventData(data) {
    if (!this.isRecord(data)) {
      return void 0;
    }
    return data;
  }
  resolveRuntimeCustomContext(config) {
    let customParamsToken;
    if (config.customParamsToken !== void 0) {
      customParamsToken = config.customParamsToken.trim();
      if (!customParamsToken) {
        this.warn("customParamsToken cannot be empty. SDK initialization will continue without custom context.");
      }
    }
    if (config.customParams === void 0) {
      if (customParamsToken !== void 0) {
        return {
          customParamsToken
        };
      }
      return null;
    }
    return {
      customParams: config.customParams,
      ...customParamsToken !== void 0 ? {
        customParamsToken
      } : {}
    };
  }
  isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  createContextVersion() {
    return `ctx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
  warn(message, error) {
    if (error === void 0) {
      console.warn(_AgentIframeManager.WARN_PREFIX, message);
      return;
    }
    console.warn(_AgentIframeManager.WARN_PREFIX, message, error);
  }
  removeIframe() {
    if (this.iframe?.parentNode) {
      this.iframe.parentNode.removeChild(this.iframe);
    }
    this.iframe = null;
  }
  createAgentInstance() {
    return {
      destroy: /* @__PURE__ */ __name(async () => {
        await this.destroy();
      }, "destroy")
    };
  }
};
__name(_AgentIframeManager, "AgentIframeManager");
__publicField(_AgentIframeManager, "WARN_PREFIX", "[aily-web-sdk]");
var AgentIframeManager = _AgentIframeManager;

// src/index.ts
async function initAilyChat(root, config) {
  const manager = new IframeManager(root, config);
  return manager.init();
}
__name(initAilyChat, "initAilyChat");
async function initAgentChat(root, config) {
  const manager = new AgentIframeManager(root, config);
  return manager.init();
}
__name(initAgentChat, "initAgentChat");
export {
  AGENT_IFRAME_BASE_URL,
  DEFAULT_ANONYMOUS_CHANNEL_TYPE,
  DEFAULT_CHANNEL_TYPE,
  IFRAME_BASE_URL,
  MESSAGE_TIMEOUT,
  getAgentIframeBaseURL,
  getIframeBaseURL,
  initAgentChat,
  initAilyChat
};
//# sourceMappingURL=index.js.map