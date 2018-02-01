'use strict';

var dragTab = null;
var dragOverTab = null;
var dragCount = 0;
var dragDropBefore;

function tabDragStart( e ) {
	if ( this.classList.contains( 'pinned' ) ) {
		e.preventDefault();
		return;
	}

	this.classList.add( 'drag' );

	e.dataTransfer.effectAllowed = 'move';
	e.dataTransfer.setData( 'text/html', 'pvDragging' );

	var rect = this.getBoundingClientRect();

	e.dataTransfer.setDragImage( this, rect.width / 2, rect.height / 2 );

	dragTab = this;
}

function tabDragEnter( e ) {
	e.preventDefault();

	if ( dragOverTab && this != dragOverTab ) {
		view.dragIndicator.classList.remove( 'show' );
		dragOverTab = this;
	}

	if ( dragCount == 0 ) {
		dragOverTab = this;
	}
	dragCount++;
}

function tabDragLeave( e ) {
	e.preventDefault();

	dragCount--;
	if ( dragCount == 0 ) {
		view.dragIndicator.classList.remove( 'show' );
		dragOverTab = null;
	}
}

function tabDragOver( e ) {
	e.preventDefault();

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	if ( dragOverTab && dragTab != dragOverTab ) {
		var rect = dragOverTab.getBoundingClientRect();

		view.dragIndicator.classList.add( 'show' );
		view.dragIndicator.style.height = ( rect.height - 10 ) + 'px';
		view.dragIndicator.style.top = ( window.scrollY + rect.top ) + 'px';

		if ( e.clientX < rect.left + ( rect.width / 2 ) ) {
			view.dragIndicator.style.left = ( rect.left - 6 ) + 'px';
			dragDropBefore = true;
		} else {
			view.dragIndicator.style.left = ( rect.left + rect.width - 6 ) + 'px';
			dragDropBefore = false;
		}
	}

	return false;
}

async function tabDrop( e ) {
	e.stopPropagation();

	if ( dragTab !== dragOverTab ) {
		if ( dragDropBefore ) {
			dragOverTab.insertAdjacentElement( 'beforebegin', dragTab );
		} else {
			dragOverTab.insertAdjacentElement( 'afterend', dragTab );
		}

		groups.forEach( function( group ) {
			updateGroupFit( group );
		} );

		var toTabId = Number( dragOverTab.getAttribute( 'tabId' ) );
		var groupId = await tabs.getGroupId( toTabId );

		var tabId = Number( dragTab.getAttribute( 'tabId' ) );
		tabs.setGroupId( tabId, groupId );


		var tab = await browser.tabs.get( tabId );
		var toTab = await browser.tabs.get( toTabId );

		var toIndex = Number( toTab.index );

		if ( tab.index < toTab.index ) {
			if ( dragDropBefore ) {
				toIndex--;
			}
		} else {
			if ( !dragDropBefore ) {
				toIndex++;
			}
		}

		browser.tabs.onMoved.removeListener( tabMoved );
		await browser.tabs.move( tabId, { index: toIndex } );
		browser.tabs.onMoved.addListener( tabMoved );
	}

	return false;
}

function groupDragOver( e ) {
	e.preventDefault(); // Necessary. Allows us to drop.

	e.dataTransfer.dropEffect = 'move'; // See the section on the DataTransfer object.

	return false;
}

async function putTabInGroup( groupId ) {
	groupNodes[ groupId ].newtab.insertAdjacentElement( 'beforebegin', dragTab );

	groups.forEach( function( group ) {
		updateGroupFit( group );
	} );

	var tabId = Number( dragTab.getAttribute( 'tabId' ) );
	tabs.setGroupId( tabId, groupId );

	var toIndex = -1;

	browser.tabs.onMoved.removeListener( tabMoved );
	await browser.tabs.move( tabId, { index: toIndex } );
	browser.tabs.onMoved.addListener( tabMoved );
}

async function groupDrop( e ) {
	e.stopPropagation();

	var groupId = Number( this.getAttribute( 'groupId' ) );

	putTabInGroup( groupId );

	return false;
}

async function outsideDrop( e ) {
	e.stopPropagation();

	const group = await groups.create();

	makeGroupNode( group );

	group.rect.x = view.pxToWidth( e.clientX - 75 );
	group.rect.y = view.pxToHeight( e.clientY - 75 );
	group.rect.w = view.pxToWidth( 150 );
	group.rect.h = view.pxToHeight( 150 );

	view.groupsNode.appendChild( groupNodes[ group.id ].group );

	putTabInGroup( group.id );

	return false;
}

function tabDragEnd( e ) {
	dragCount = 0;
	this.classList.remove( 'drag' );
	view.dragIndicator.classList.remove( 'show' );
}
