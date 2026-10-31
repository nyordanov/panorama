var tabs = tabs || {};

tabs.setGroupId = async function( tabId, groupId ) {
	await browser.sessions.setTabValue( tabId, 'groupId', groupId );
	await tabs.toggleAll();
};

tabs.getGroupId = async function( tabId ) {
	return browser.sessions.getTabValue( tabId, 'groupId' );
};

tabs.forEach = async function( callback ) {
	const tabs = browser.tabs.query( { currentWindow: true } );

	var promises = [];

	for ( const tab of await tabs ) {
		promises.push( callback( tab ) );
	}

	await Promise.all( promises );
};

// show/hide in two batched calls; per-tab calls make the tab strip animate each one (upstream a54b71a)
tabs.toggleAll = async function( windowId ) {
	if ( windowId === undefined ) {
		windowId = ( await browser.windows.getCurrent() ).id;
	}

	const activeGroup = await browser.sessions.getWindowValue( windowId, 'activeGroup' );
	const show = [], hide = [];

	await Promise.all( ( await browser.tabs.query( { windowId } ) ).map( async tab => {
		if ( tab.pinned ) {
			return;
		}
		( await tabs.getGroupId( tab.id ) == activeGroup ? show : hide ).push( tab.id );
	} ) );

	if ( hide.length ) browser.tabs.hide( hide );
	if ( show.length ) browser.tabs.show( show );
};
