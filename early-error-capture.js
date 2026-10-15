/* ============================================================
    Early Error Capture — 最早安装的全局错误捕获
    在任何外部库和业务脚本之前加载，捕获后续脚本的运行时错误
    仅保留安全摘要，不存堆栈、URL、行号或隐私数据
    ============================================================ */
(function() {
    'use strict';

    var MAX_ERRORS = 10;
    var MAX_MSG_LEN = 120;
    var errorLog = [];

    function safeSummary(msg) {
        if (!msg) return '未知错误';
        var s = String(msg);
        if (s.length > MAX_MSG_LEN) s = s.slice(0, MAX_MSG_LEN) + '\u2026';
        return s;
    }

    function pushEntry(type, message) {
        if (errorLog.length >= MAX_ERRORS) return;
        errorLog.push({ type: type, message: safeSummary(message) });
    }

    window.addEventListener('error', function(e) {
        var msg = '脚本错误';
        try {
            if (e && e.message) msg = e.message;
            else if (e && e.error && e.error.message) msg = e.error.message;
        } catch (_) {}
        pushEntry('error', msg);
    });

    window.addEventListener('unhandledrejection', function(e) {
        var msg = 'Promise 异常';
        try {
            if (e && e.reason) {
                if (typeof e.reason === 'string') msg = e.reason;
                else if (e.reason.message) msg = e.reason.message;
            }
        } catch (_) {}
        pushEntry('unhandledrejection', msg);
    });

    // 暴露只读接口
    window.__earlyErrors = {
        getLog: function() { return errorLog.slice(); },
        getCount: function() { return errorLog.length; },
        // 供测试钩子使用：插入带唯一标记的模拟错误
        _injectMock: function(marker) {
            if (errorLog.length >= MAX_ERRORS) return null;
            var entry = { type: 'error', message: marker, _mock: true };
            errorLog.push(entry);
            return marker;
        },
        // 按标记删除模拟错误（不是 pop，避免误删并发真实错误）
        _removeMock: function(marker) {
            for (var i = errorLog.length - 1; i >= 0; i--) {
                if (errorLog[i]._mock && errorLog[i].message === marker) {
                    errorLog.splice(i, 1);
                    return true;
                }
            }
            return false;
        }
    };
})();
