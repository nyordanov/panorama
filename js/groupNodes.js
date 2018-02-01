'use strict';

// https://gist.github.com/beaucharman/1f93fdd7c72860736643d1ab274fee1a
function debounce(callback, wait, context = this) {
	let timeout = null;
	let callbackArgs = null;

	const later = () => callback.apply(context, callbackArgs);

	return function() {
		callbackArgs = arguments;
		clearTimeout(timeout);
		timeout = setTimeout(later, wait);
	}
}

var groupNodes = {};

async function initGroupNodes() {

	groups.forEach( function( group ) {
		makeGroupNode( group );
		view.groupsNode.appendChild( groupNodes[ group.id ].group );
	} );
	fillGroupNodes();

	groupNodes.pinned = {
		content: document.getElementById( 'pinnedTabs' ),
	};

	let createGroupStart = {};
	view.groupsNode.addEventListener( 'mousedown', event => {
		if ( event.target.id === 'groups' ) {
			event.preventDefault();
			event.stopPropagation();

			createGroupStart = {
				x: event.clientX,
				y: event.clientY,
			};

			Object.assign( view.resizeDummy.style, {
				opacity: 1,
				top: createGroupStart.y + 'px',
				left: createGroupStart.x + 'px',
				width: 0,
				height: 0,
			} );

			document.addEventListener( 'mousemove', createGroupMove );
			document.addEventListener( 'mouseup', createGroupEnd, { once: true } );
		}
	} );

	const createGroupMove = function( event ) {
		requestAnimationFrame( () => {
			view.resizeDummy.style.width = `${event.clientX - createGroupStart.x}px`;
			view.resizeDummy.style.height = `${event.clientY - createGroupStart.y}px`;
		} );
	};

	const createGroupEnd = async function( event ) {
		event.preventDefault();

		createGroupMove( event );
		document.removeEventListener( 'mousemove', createGroupMove );

		let width = event.clientX - createGroupStart.x;
		let height = event.clientY - createGroupStart.y;

		// probably accidental
		if ( width < 10 || height < 10 ) {
			return;
		}

		// set min dimensions
		width = Math.max( width, 150 );
		height = Math.max( height, 100 );

		let group = await groups.create();
		makeGroupNode( group );

		Object.assign( group.rect, {
			x: view.pxToWidth( createGroupStart.x ),
			y: view.pxToHeight( createGroupStart.y ),
			w: view.pxToWidth( width ),
			h: view.pxToHeight( height ),
		} );

		view.groupsNode.appendChild( groupNodes[ group.id ].group );
		updateGroupFit( group );

		view.resizeDummy.style.opacity = 0;
	};
}

function makeGroupNode( group ) {

	// corners
	var bottom_right = new_element( 'div', { class: 'bottom_right' } );

	// header
	var name = new_element( 'span', { class: 'name', content: group.name } );
	var input = new_element( 'input', { type: 'text', value: group.name } );

	var tabCount = new_element( 'span', { class: 'tab_count', content: group.tabCount } );

	var close = new_element( 'div', { class: 'close' } );

	var header = new_element( 'div', { class: 'header' }, [ name, input, tabCount, close ] );

	// newtab
	var newtab = new_element( 'div', { class: 'newtab' }, [ new_element( 'div', { class: 'wrap' }, [ new_element( 'div', { class: 'inner' } ) ] ) ] );

	// group
	var content = new_element( 'div', { class: 'content transition', groupId: group.id }, [ newtab ] );
	content.addEventListener( 'dragover', groupDragOver, false );
	content.addEventListener( 'drop', groupDrop, false );

	var node = new_element( 'div', { class: 'group' }, [ bottom_right, header, content ] );

	Object.assign( node.style, {
		zIndex: group.id,
		willChange: 'transform',
	} );

	close.addEventListener( 'click', function( event ) {
		event.stopPropagation();

		var childNodes = content.childNodes;
		var tabCount = childNodes.length - 1;

		if ( tabCount > 0 ) {
			if ( window.confirm( 'Closing this Group will close the ' + tabCount + ' tab' + ( tabCount == 1 ? '' : 's' ) + ' within it' ) ) {
				groups.remove( group.id );
				removeGroupNode( group.id );

				tabs.forEach( async function( tab ) {
					var groupId = await tabs.getGroupId( tab.id );
					if ( groupId == group.id ) {
						browser.tabs.remove( tab.id );
					}
				} );
				var first = true;
				groups.forEach( function( g ) {
					if ( first ) {
						groups.setActive( g.id );
					}
				} );
			}
		} else {
			groups.remove( group.id );
			removeGroupNode( group.id );
		}
	}, false );

	content.addEventListener( 'click', function( event ) {
		event.stopPropagation();
	}, false );

	newtab.addEventListener( 'click', async function( event ) {
		event.stopPropagation();
		await groups.setActive( group.id );
		await browser.tabs.create( { active: true } );
	}, false );

	groupNodes[ group.id ] = {
		group: node,
		content: content,
		newtab: newtab,
		tabCount: tabCount
	};

	moveGroup( group );
	resizeGroup( group );

	// renaming groups
	name.addEventListener( 'mousedown', function( event ) {
		event.stopPropagation();

		header.classList.add( 'input' );
	}, false );

	input.addEventListener( 'blur', function( event ) {
		name.innerHTML = '';
		name.appendChild( document.createTextNode( this.value ) );
		header.classList.remove( 'input' );
		groups.rename( group.id, this.value );
	}, false );
	// ----

	// move
	let moveStart = {}, initialPosition = {};
	header.addEventListener( 'mousedown', function( event ) {
		moveStart = {
			x: event.clientX,
			y: event.clientY,
		};

		initialPosition = {
			x: group.rect.x,
			y: group.rect.y,
		}

		document.addEventListener( 'mousemove', moveHandler, false );

		event.preventDefault();
		event.stopPropagation();
	}, false );

	const moveHandler = function( event ) {
		event.preventDefault();
		event.stopPropagation();

		group.rect.x = view.pxToWidth( initialPosition.x + event.clientX - moveStart.x ),
		group.rect.y = view.pxToHeight( initialPosition.y + event.clientY - moveStart.y ),

		moveGroup( group );
	};

	header.addEventListener( 'mouseup', function( event ) {
		//event.preventDefault();
		event.stopPropagation();

		document.removeEventListener( 'mousemove', moveHandler, false );

		moveHandler( event );
		groups.save();
	}, false );

	// resize
	let resizeStart = {}, windowWidth, windowHeight;
	bottom_right.addEventListener( 'mousedown', function( event ) {
		event.preventDefault();
		event.stopPropagation();

		resizeStart = {
			x: event.clientX,
			y: event.clientY,
		};

		Object.assign( view.resizeDummy.style, {
			opacity: 1,
			top: (group.rect.y * 100) + 'vh',
			left: (group.rect.x * 100) + 'vw',
			width: (group.rect.w * 100) + 'vw',
			height: (group.rect.h * 100) + 'vh',
		} );

		node.style.opacity = 1;

		windowWidth = window.innerWidth;
		windowHeight = window.innerHeight;

		document.addEventListener( 'mousemove', resizeHandler, false );
		document.addEventListener( 'mouseup', resizeEndHandler, { once: true } );
	}, false );

	const resizeHandler = function( event ) {
		let scaleX = ( event.clientX - resizeStart.x + group.rect.w * windowWidth ) / ( group.rect.w * windowWidth );
		let scaleY = ( event.clientY - resizeStart.y + group.rect.h * windowHeight ) / ( group.rect.h * windowHeight );

		view.resizeDummy.style.transform = `scale(${scaleX}, ${scaleY})`;
	};

	const resizeEndHandler = function( event ) {
		event.preventDefault();
		event.stopPropagation();

		document.removeEventListener( 'mousemove', resizeHandler, false );

		resizeHandler( event );

		let scaleX = ( event.clientX - resizeStart.x + group.rect.w * windowWidth ) / ( group.rect.w * windowWidth );
		let scaleY = ( event.clientY - resizeStart.y + group.rect.h * windowHeight ) / ( group.rect.h * windowHeight );

		group.rect.w *= scaleX;
		group.rect.h *= scaleY;

		resizeGroup( group );
		updateGroupFit( group );

		view.resizeDummy.style.opacity = 0;
		node.style.opacity = 1;
	};

	window.addEventListener( 'resize', debounce( event => {
		groups.forEach( function( group ) {
			updateGroupFit( group );
		} );
	}, 100 ) );
}

function removeGroupNode( groupId ) {
	groupNodes[ groupId ].group.parentNode.removeChild( groupNodes[ groupId ].group );
	delete groupNodes[ groupId ];
}

function moveGroup( group ) {
	requestAnimationFrame( () => {
		if ( group.id in groupNodes ) {
			groupNodes[ group.id ].group.style.transform = `translate(${group.rect.x * 100}vw, ${group.rect.y * 100}vh)`;
		}
	} );
}

function resizeGroup( group ) {
	requestAnimationFrame( () => {
		groupNodes[ group.id ].group.style.width = `${group.rect.w * 100}vw`;
		groupNodes[ group.id ].group.style.height = `${group.rect.h * 100}vh`;
	} );
}

function getBestFit( param ) {

	var hmax = Math.floor( param.width / param.minWidth );
	var hmin = Math.ceil( param.width / param.maxWidth );
	var vmax = Math.floor( param.height / ( param.minWidth * param.ratio ) );
	var vmin = Math.floor( param.height / ( param.maxWidth * param.ratio ) );

	var area = param.minWidth * ( param.minWidth * param.ratio );
	var tmp_area;
	var tmpx = -1;
	var tmpy = -1;

	for ( var y = vmin; y <= vmax; y++ ) {
		for ( var x = hmin; x <= hmax; x++ ) {
			if ( ( x * y ) >= param.amount ) {

				var w = ( param.width / x );
				var h = ( ( param.width / x ) * param.ratio );

				if ( ( h * y ) <= param.height ) {
					tmp_area = w * h;

					if ( tmp_area > area ) {
						area = tmp_area;
						tmpx = x;
						tmpy = y;
					}
				}
			}
		}
	}
	return { x: tmpx, y: tmpy };
}

async function fillGroupNodes() {
	var fragment = {
		pinned: document.createDocumentFragment(),
	};

	groups.forEach( function( group ) {
		fragment[ group.id ] = document.createDocumentFragment();
	} );

	await tabs.forEach( async function( tab ) {
		if ( !tab.pinned ) {
			const groupId = await tabs.getGroupId( tab.id );
			if ( groupId != -1 && fragment[ groupId ] ) {
				fragment[ groupId ].appendChild( tabNodes[ tab.id ].tab );
			}
		} else {
			fragment.pinned.appendChild( tabNodes[ tab.id ].tab );
		}
	} );

	groups.forEach( function( group ) {
		groupNodes[ group.id ].content.insertBefore( fragment[ group.id ], groupNodes[ group.id ].newtab );
		updateGroupFit( group );
	} );

	groupNodes.pinned.content.appendChild( fragment.pinned );
}

async function insertTab( tab ) {

	var groupId = await tabs.getGroupId( tab.id );

	if ( groupId != -1 ) {

		var index = 0;

		var childNodes = groupNodes[ groupId ].content.childNodes;

		for ( var i = 0; i < childNodes.length - 1; i++ ) {

			var _tabId = Number( childNodes[ i ].getAttribute( 'tabId' ) );
			var _tab = await browser.tabs.get( _tabId );

			if ( _tab.index >= tab.index ) {
				break;
			}
			index++;
		}

		var tabNode = tabNodes[ tab.id ];

		if ( index < childNodes.length - 1 ) {
			childNodes[ index ].insertAdjacentElement( 'beforebegin', tabNode.tab );
		} else {
			groupNodes[ groupId ].newtab.insertAdjacentElement( 'beforebegin', tabNode.tab );
		}
	}
}

function updateGroupFit( group ) {
	requestAnimationFrame( () => {
		var node = groupNodes[ group.id ];
		var childNodes = node.content.childNodes;

		node.tabCount.innerHTML = '';
		node.tabCount.appendChild( document.createTextNode( childNodes.length - 1 ) );

		// fit
		var rect = node.content.getBoundingClientRect();

		var ratio = background.config.tab.ratio;
		var small = false;

		var fit = getBestFit( {
			width: rect.width,
			height: rect.height,

			minWidth: background.config.tab.minWidth,
			maxWidth: background.config.tab.maxWidth,

			ratio: ratio,

			amount: childNodes.length,
		} );

		if ( fit.x == -1 || fit.y == -1 ) {
			ratio = 1;
			small = true;

			fit = getBestFit( {
				width: rect.width,
				height: rect.height,

				minWidth: 50,
				maxWidth: 99,

				ratio: ratio,

				amount: childNodes.length,
			} );
		}

		// this should be the deck view
		if ( fit.x == -1 || fit.y == -1 ) {
			fit = {
				x: 11,
				y: 10,
			}
		}

		var index = 0;

		var w = rect.width / fit.x;
		var h = w * ratio;

		for ( var i = 0; i < childNodes.length; i++ ) {
			if ( small ) {
				childNodes[ i ].classList.add( 'small' );
			} else {
				childNodes[ i ].classList.remove( 'small' );
			}

			childNodes[ i ].style.width = w + 'px';
			childNodes[ i ].style.height = h + 'px';
			childNodes[ i ].style.left = ( w * ( index % fit.x ) ) + 'px';
			childNodes[ i ].style.top = ( h * Math.floor( index / fit.x ) ) + 'px';

			index++;
		}
	} );
}
