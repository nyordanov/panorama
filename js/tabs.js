var tabs = tabs || {};

tabs.setGroupId = async function(tabId, groupId) {
	await browser.sessions.setTabValue(tabId, 'groupId', groupId);
	await tabs.toggleAll();
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

tabs.toggleAll = async function() {
	const activeGroup = await groups.getActive();

	tabs.forEach(async function( tab ) {
		var groupId = await tabs.getGroupId( tab.id );

		if ( groupId != activeGroup ) {
			browser.tabs.hide( tab.id );
		} else {
			browser.tabs.show( tab.id );
		}
	});
}