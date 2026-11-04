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

// Stores a downscaled capture with the tab, because a discarded tab can't be captured: it keeps
// showing its last stored thumbnail. Resolves to the capture, or undefined if there is none.
// ponytail: thumbnails live in the session store, ~30KB per tab; add a cap if that file gets too big
tabs.captureThumbnail = async function( tabId ) {
	try {
		const tab = await browser.tabs.get( tabId );

		if ( tab.discarded || tab.pinned || tab.url === browser.runtime.getURL( 'view.html' ) ) {
			return;
		}

		const thumbnail = await browser.tabs.captureTab( tabId, { format: 'jpeg', quality: 60, scale: 0.25 } );
		await browser.sessions.setTabValue( tabId, 'thumbnail', thumbnail );

		return thumbnail;
	} catch ( e ) {
		// closed in the meantime, discarded or a page that can't be captured: keep the stored one
	}
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
