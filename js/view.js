'use strict';

function new_element( name, attributes, children ) {

	const e = document.createElement( name );

	for ( const key in attributes ) {
		if ( key == 'content' ) {
			e.appendChild( document.createTextNode( attributes[ key ] ) );
		} else {
			e.setAttribute( key.replace( /_/g, '-' ), attributes[ key ] );
		}
	}

	for ( const child of children || [] ) {
		e.appendChild( child );
	}

	return e;
}

var background = browser.extension.getBackgroundPage();

var view = {
	windowId: -1,
	tabId: -1,
	groupsNode: null,
	dragIndicator: null,

	tabs: {},

	pxToWidth: function( px ) {
		return px / window.innerWidth;
	},

	pxToHeight: function( px ) {
		return px / window.innerHeight;
	}
};

async function initView() {

	view.windowId = ( await browser.windows.getCurrent() ).id;
	view.tabId = ( await browser.tabs.getCurrent() ).id;
	view.groupsNode = document.getElementById( 'groups' );
	view.resizeDummy = document.getElementById( 'resize-dummy' );

	view.dragIndicator = new_element( 'div', { class: 'drag_indicator' } );
	view.groupsNode.appendChild( view.dragIndicator );

	await groups.init();

	// init Nodes
	await initTabNodes();
	await initGroupNodes();

	// set all listeners
	browser.tabs.onCreated.addListener( tabCreated );
	browser.tabs.onRemoved.addListener( tabRemoved );

	browser.tabs.onUpdated.addListener( tabUpdated );
	browser.tabs.onMoved.addListener( tabMoved );

	browser.tabs.onAttached.addListener( tabAttached );
	browser.tabs.onDetached.addListener( tabDetached );

	browser.tabs.onActivated.addListener( tabActivated );

	view.groupsNode.addEventListener( 'dragover', groupDragOver, false );
	view.groupsNode.addEventListener( 'drop', outsideDrop, false );
}


document.addEventListener( 'DOMContentLoaded', initView, false );

async function tabCreated( tab, groupId = undefined ) {
	if ( view.windowId == tab.windowId ) {
		makeTabNode( tab );
		updateTabNode( tab );
		updateFavicon( tab );

		while ( groupId === undefined ) {
			groupId = await tabs.getGroupId( tab.id );
		}

		var group = groups.get( groupId );

		await insertTab( tab );
		updateGroupFit( group );
	}
}

function tabRemoved( tabId, removeInfo ) {
	if ( view.windowId == removeInfo.windowId && view.tabId != tabId ) {
		deleteTabNode( tabId );
		groups.forEach( function( group ) {
			updateGroupFit( group );
		} );
	}
}

async function tabUpdated( tabId, changeInfo, tab ) {
	if ( view.windowId === tab.windowId ) {
		updateTabNode( tab );
		updateFavicon( tab );
	}

	if ( 'pinned' in changeInfo ) {
		fillGroupNodes();
		updateTabNode( tab );
	}
}

async function tabMoved( tabId, moveInfo ) {
	if ( view.windowId == moveInfo.windowId ) {
		browser.tabs.get( tabId ).then( async function( tab ) {
			await insertTab( tab );
			groups.forEach( async function( group ) {
				updateGroupFit( group );
			} );
		} );
	}
}

async function tabAttached( tabId, attachInfo ) {
	if ( view.windowId == attachInfo.newWindowId ) {
		let tab = await browser.tabs.get( tabId );

		tabs.setGroupId( tabId, await browser.sessions.getWindowValue( view.windowId, 'activeGroup' ) );
		tabCreated( tab );
	}
}

function tabDetached( tabId, detachInfo ) {
	if ( view.windowId == detachInfo.oldWindowId ) {
		deleteTabNode( tabId );
		groups.forEach( function( group ) {
			updateGroupFit( group );
		} );
	}
}

async function tabActivated( activeInfo ) {
	if ( activeInfo.tabId === view.tabId ) {
		await tabs.forEach( async function( tab ) {
			updateThumbnail( tab.id );
		} );
	} else {
		browser.tabs.hide( view.tabId );
	}

	setActiveTabNode();
}
