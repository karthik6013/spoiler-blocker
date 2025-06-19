class CmdHandler {
    constructor(settings) {
        this.settings = settings;
        this.blockedCounts = {
            // since the browser was open
            session: {
                total: 0,
                hosts: {

                }
            },
            // on this page load
            // tracked by tabId
            page: {}
        }

        // updated on each call to incBlockCount before count is incremented
        // used by showCorrectBadgeCount to do active count up
        this.prevBlockedCounts;

        this.blockedCounts.lifetime = this.settings.lifetimeBlockedCount;
        this.tabOnActivated = this.tabOnActivated.bind(this);
    }

    validUrl(url) {
        return this.settings.sitesRegex ? this.settings.sitesRegex.test(url) : false;
    }

    shouldBlock(url) {
        return this.settings.blockingEnabled && this.settings.spoilersRegex && this.validUrl(url);
    }

    getSelectors(url) {
        let selectors = [];

        for (var info of this.settings.compiledSitesAndSelectors) {
            if (info.urlRegex.test(url)) {
                selectors.push(info.selector);
            }
        }

        return selectors.join(',');
    }

    getSetting(setting) {
        return this.settings[setting];
    }

    getSettings() {
        return this.settings.allSettings;
    }

    setSetting(data) {
        return this.settings[data.name] = data.value;
    }

    saveSettings(data) {
        settings = new Settings(data);
        this.settings = settings;

        return this.settings.save();
    }

    getDefaultSettings() {
        return Settings.defaultSettings;
    }

    hasSpoilers(text) {
        var regex = this.settings.spoilersRegex
        return text.match(regex);
    }

    incBlockCount(count, sender) {
        let tabInfo = sender.tab;
        // let tabInfo = await getTabInfo(tabId);
        let url = new URL(tabInfo.url);

        if (!count) {
            count = 1;
        }

        // if it's a good enough deep clone for Mozilla...
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign
        this.prevBlockedCounts = JSON.parse(JSON.stringify(this.blockedCounts));

        // lifetime (is persisted and synced kinda?)
        this.blockedCounts.lifetime.total += count;
        if (!this.blockedCounts.lifetime.hosts[url.host]) {
            this.blockedCounts.lifetime.hosts[url.host] = 0;
        }
        this.blockedCounts.lifetime.hosts[url.host] += count;
        // @todo this is a perfect example for a proxied Setting object
        this.settings.lifetimeBlockedCount = this.blockedCounts.lifetime;

        // session
        this.blockedCounts.session.total += count;
        if (!this.blockedCounts.session.hosts[url.host]) {
            this.blockedCounts.session.hosts[url.host] = 0;
        }

        this.blockedCounts.session.hosts[url.host] += count;


        if (!this.blockedCounts.page[tabInfo.id]) {
            this.blockedCounts.page[tabInfo.id] = 0;
        }

        this.blockedCounts.page[tabInfo.id] += count;

        return this.blockedCounts;
    }

    isSubscribed(url) {
        for (let sub of this.settings.subscriptions) {
            if (url == sub.url) {
                return true;
            }
        }

        return false;
    }

    // when a tab is activated, see if the badge needs updated
    // based on the settings
    showCorrectBadgeCount(data, sender) {
        let tab, url, prevC, newC;

        // default to sender's tab, but allow settings to specify tab
        // it has problems resolving the active tab when this is called from settings
        if (data && data.tab) {
            tab = data.tab;
        } else {
            if (!sender.tab) {
                return;
            }
            tab = sender.tab;
        }

        if (!tab) {
            return;
        }

        if (Subscription.isSubscribableUrl(tab.url)) {
            if (this.isSubscribed(tab.url)) {
                return this.setBadgeText('✓', '#4688f1', tab.id);
            } else {
                return this.setBadgeText('+1', '#1fca23', tab.id);
            }
        } else if (Subscription.isGitHubRevision(tab.url)) {
            return this.setBadgeText('+1', '#f2b52d', tab.id);
        }

        if (this.settings.badgeDisplay == 'none') {
            return this.setBadgeText('', '', tab.id);
        }

        // if we're showing life, tabs don't matter
        if (this.settings.badgeDisplay == 'life') {
            // prevC = this.prevBlockedCounts.lifetime.total;
            newC = this.blockedCounts.lifetime.total;
        } else {
            switch (this.settings.badgeDisplay) {
                case 'lifeSite':
                    url = new URL(tab.url);
                    // prevC = this.prevBlockedCounts.lifetime.hosts[url.host];
                    newC = this.blockedCounts.lifetime.hosts[url.host];
                    break;

                case 'session':
                    // prevC = this.prevBlockedCounts.session.total;
                    newC = this.blockedCounts.session.total;
                    break;

                case 'sessionSite':
                    url = new URL(tab.url);
                    // prevC = this.prevBlockedCounts.session.hosts[url.host];
                    newC = this.blockedCounts.session.hosts[url.host];
                    break;

                case 'pageload':
                    // prevC = this.prevBlockedCounts.page[tab.id];
                    newC = this.blockedCounts.page[tab.id];
                    break;

                case 'none':
                    return this.setBadgeText('');
                    break;
            }
        }

        this.setBadgeText(helpers.friendlyNum(newC), '#4688f1', tab.id);

        // set timeout doesn't work in extensions
        // not sure how to do a count up timer from here...
        // while (prevC++ < newC) {
        //     console.log("Setting to ", prevC);
        //     helpers.friendlyNum(prevC);
        //     setTimeout(() => {
        //         this.setBadgeText(helpers.friendlyNum(prevC));
        //     }, 1000);
        // }

        return {
            text: newC
        };
    }

    resetBadgePageCount(cmd, sender) {
        if (sender.tab && sender.tab.id) {
            this.blockedCounts.page[sender.tab.id] = 0;
        }

        return;
    }

    debug(msg) {
        console.log(msg);
        return msg;
    }

    getActiveTabInfo() {
        return _getActiveTabInfo();
    }

    setBadgeText(text = '', color = null, tabId = null) {
        if (typeof text === 'object') {
            color = text.color || '#4688f1';
            delete text.color;
            tabId = text.tabId || null;
        } else {
            text = {
                text: text.toString(),
                tabId: tabId
            }
        }

        if (text.text === "0" || text.text === 0) {
            text.text = '';
        }

        chrome.browserAction.setBadgeText(text);

        if (chrome.browserAction.setBadgeTextColor) {
            chrome.browserAction.setBadgeTextColor({color: '#ffffff'});
        }

        if (color) {
            chrome.browserAction.setBadgeBackgroundColor({
                color: color,
                tabId: tabId
            });
        } else {
            // there isn't a standardized way to reset the color
            chrome.browserAction.setBadgeBackgroundColor({
                color: /firefox/i.test(navigator.userAgent) ? null : '#12345600'
            });
        }
    }

    getVariableStyles() {
        return {
            transitionDurationSecs: this.settings.transitionDurationSecs,
            heavyBlur: this.settings.heavyBlur,
            hoverBlur: this.settings.hoverBlur
        }
    }

    tabOnActivated(info) {
        var self = this;
        chrome.tabs.get(info.tabId, function(tabInfo) {
            self.showCorrectBadgeCount(null, {tab: tabInfo});
        });
    }

    async highlightElementsInActiveTab(selector) {
        let tab = await _getActiveTabInfo();
        return chrome.tabs.sendMessage(tab.id, {
            cmd: 'highlightElements',
            data: { selector }
        });
    }

    async updateSubscriptions() {
        let success = true;
        let subs = [];

        for (let info of this.settings.subscriptions) {
            if (!info) {
                continue;
            }

            let sub = Subscription.factory(info);
            let updated = await sub.update();
            if (!updated) {
                success = false;
            }
            subs.push(sub);
        }

        this.settings.subscriptions = subs;
        return success ? subs : false;
    }
}

function debugMsg(req, res) {
    let max = 50;

    let open = `<-- ${req.cmd}`;
    if (req.data) {
        let desc = helpers.describe(req.data).replace(/\s\s+/g, ' ');
        let param = helpers.excerpt(desc, max - open.length - 2);
        open += `(${param})`;
    }

    open = open.padEnd(max, " ");

    let end = " -->";
    end = helpers.excerpt(res, max - end.length) + end;
    end = end.padStart(max, " ");

    console.groupCollapsed(open, "|", end);

    console.log("Request", req);
    console.log("Response", res);
    if (req.stack) {
        console.log("Stack", req.stack);
        delete req.stack;
    }
    console.groupEnd();
}

// manage settings object here to avoid reloading on every page
// and so we can pre-compile the regex
async function init() {
    settings = await Settings.factory();
    let cmdHandler = new CmdHandler(settings);

    chrome.runtime.onMessage.addListener(function(req, sender, cb) {
        let res = '';

        if (req.cmd in cmdHandler) {
            res = cmdHandler[req.cmd].call(cmdHandler, req.data, sender);
        } else {
            if (settings.debug) {
                debugMsg(req, res);
            }
            throw `Unknown command '${cmd}'`;
        }

        if (settings.debug) {
            debugMsg(req, res);
        }
        if (res instanceof Promise) {
            res.then(v => {
                cb(v);
            })
        } else {
            cb(res);
        }

        return true;
    });

    chrome.tabs.onActivated.addListener(cmdHandler.tabOnActivated);
    // cmdHandler.showCorrectBadgeCount();

    // @todo doesn't work on ff reliably
    chrome.runtime.onConnect.addListener((port) => {
        port.onDisconnect.addListener(() => {
            cmdHandler.highlightElementsInActiveTab('!!invalid selector!!');
        });
    });

    // update subs once an hour
    chrome.alarms.create('autoupdateSubscriptions', {
        delayInMinutes: 1,
        periodInMinutes: 60
    });

    chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'autoupdateSubscriptions') {
            console.log('Autoupdating subscriptions');
            cmdHandler.updateSubscriptions();
        }
    });

    return settings;
}

async function getTabInfo(info) {
    return new Promise(res => {
        chrome.tabs.get(info.tabId, (info) => {
            res(info);
        });
    });
}

async function _getActiveTabInfo() {
    return new Promise(res => {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, (tabs) => {
            let tab = tabs.pop();
            res(tab);
        });
    });
}

chrome.runtime.onInstalled.addListener(details => {
    if (details.reason == 'install') {
        helpers.openPage('tutorial.html');
    }
});


// so it's accessible on the background page console
var settings;
init();