var tabs = tabs || {};

tabs.setGroupId = async function(tabId, groupId) {
	await browser.sessions.setTabValue(tabId, 'groupId', groupId);
};

tabs.getGroupId = async function(tabId) {
	return browser.sessions.getTabValue(tabId, 'groupId');
};

tabs.forEach = async function(callback) {
	const tabs = browser.tabs.query({currentWindow: true});

	var promises = [];

	for(const tab of await tabs) {
		promises.push(callback(tab));
	}

	await Promise.all(promises);
};
