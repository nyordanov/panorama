'use strict';

var config = {
	tab: {
		minWidth: 100,
		maxWidth: 250,
		ratio: 0.68,
	},
};

var openingView = false;

async function getViewId() {
	const tabs = await browser.tabs.query( { url: browser.extension.getURL( "view.html" ), currentWindow: true } );

	return tabs.length ? tabs[ 0 ].id : undefined;
}

async function openView() {
	const viewId = await getViewId();

	if ( viewId ) {
		browser.tabs.update( Number( viewId ), { active: true } );
	} else {
		openingView = true;
		browser.tabs.create( { url: "/view.html", active: true } );
	}
}

async function tabCreated( tab ) {
	if ( !openingView ) {

		var tabGroupId = await browser.sessions.getTabValue( tab.id, 'groupId' );

		if ( tabGroupId === undefined ) {

			var activeGroup = undefined;

			while ( activeGroup === undefined ) {
				activeGroup = ( await browser.sessions.getWindowValue( tab.windowId, 'activeGroup' ) );
			}

			browser.sessions.setTabValue( tab.id, 'groupId', activeGroup );
		}
	} else {
		openingView = false;
		browser.sessions.setTabValue( tab.id, 'groupId', -1 );
	}
}

async function setupWindows() {

	const windows = browser.windows.getAll( {} );

	for ( const window of await windows ) {

		var groups = await browser.sessions.getWindowValue( window.id, 'groups' );

		if ( groups === undefined ) {
			createGroupInWindow( window );
		}
	}
}

async function newGroupUid( windowId ) {
	var groupIndex = ( await browser.sessions.getWindowValue( windowId, 'groupIndex' ) );

	var uid = groupIndex || 0;
	var newGroupIndex = uid + 1;

	await browser.sessions.setWindowValue( windowId, 'groupIndex', newGroupIndex );

	return uid;
}

async function createGroupInWindow( window ) {

	var groupId = await newGroupUid( window.id );

	var groups = [ {
		id: groupId,
		name: `Group ${groupId}`,
		containerId: 'firefox-default',
		rect: { x: 0, y: 0, w: 0.25, h: 0.5 },
		tabCount: 0,
	} ];


	browser.sessions.setWindowValue( window.id, 'groups', groups );
	browser.sessions.setWindowValue( window.id, 'activeGroup', groupId );

	const tabs = browser.tabs.query( { windowId: window.id } );

	for ( const tab of await tabs ) {
		browser.sessions.setTabValue( tab.id, 'groupId', groupId );
	}
}

async function salvageGrouplessTabs() {
	// make array of all groups for quick look-up
	let windows = {};
	const _windows = await browser.windows.getAll( {} );

	for ( const w of _windows ) {
		windows[ w.id ] = { groups: null };
		windows[ w.id ].groups = await browser.sessions.getWindowValue( w.id, 'groups' );
	}

	// check all tabs
	const tabs = browser.tabs.query( {} );

	for ( const tab of await tabs ) {
		let groupId = await browser.sessions.getTabValue( tab.id, 'groupId' );

		if ( groupId === undefined ) {
			let activeGroup = await browser.sessions.getWindowValue( tab.windowId, 'activeGroup' );
			browser.sessions.setTabValue( tab.id, 'groupId', activeGroup );
		} else {
			let groupExists = false;
			for ( const group of windows[ tab.windowId ].groups ) {
				if ( group.id == groupId ) {
					groupExists = true;
					break;
				}
			}
			if ( !groupExists ) {
				let activeGroup = await browser.sessions.getWindowValue( tab.windowId, 'activeGroup' );
				browser.sessions.setTabValue( tab.id, 'groupId', activeGroup );
			}
		}
	}
}

async function init() {
	await setupWindows();
	await salvageGrouplessTabs();

	browser.browserAction.onClicked.addListener( openView );
	browser.windows.onCreated.addListener( createGroupInWindow );
	browser.tabs.onCreated.addListener( tabCreated );

	browser.windows.onFocusChanged.addListener( async windowId =>  {
		await groups.init();
		await tabs.toggleAll();
	} );

	browser.commands.onCommand.addListener( async function( command ) {
		if ( command == "open-panorama" ) {
			const viewId = await getViewId();

			if ( viewId && ( await browser.tabs.get( viewId ) ).active ) {
				browser.tabs.remove( viewId );
			} else {
				openView();
			}
		}
	} );

	await groups.init();

	let windowId = ( await browser.windows.getCurrent() ).id;
	await groups.setActive( await browser.sessions.getWindowValue( windowId, 'activeGroup' ) );

	printSessionData();
}

async function printSessionData() {
	let windowId = ( await browser.windows.getCurrent() ).id;

	console.log( await browser.sessions.getWindowValue( windowId, 'activeGroup' ) );
	console.log( await browser.sessions.getWindowValue( windowId, 'groups' ) );
}

init();
