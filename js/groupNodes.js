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
		if ( event.target.id === 'groups' && event.button === 0 ) {
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
		groups.save();

		view.resizeDummy.style.opacity = 0;
	};

	window.addEventListener( 'resize', debounce( event => {
		groups.forEach( function( group ) {
			updateGroupFit( group );
		} );
	}, 100 ) );

	document.getElementById( 'autoLayout' ).addEventListener( 'click', autoLayout, false );
}

function makeGroupNode( group ) {

	// corners
	var bottom_right = new_element( 'div', { class: 'bottom_right' } );

	// header
	var input = new_element( 'input', { type: 'text', value: group.name } );

	var tabCount = new_element( 'span', { class: 'tab_count', content: group.tabCount } );

	var close = new_element( 'div', { class: 'close' } );

	var header = new_element( 'div', { class: 'header' }, [ input, tabCount, close ] );

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

	close.addEventListener( 'click', async function( event ) {
		event.stopPropagation();

		let other;
		groups.forEach( g => {
			if ( other === undefined && g.id != group.id ) {
				other = g.id;
			}
		} );

		// ponytail: the last group can't be closed, new tabs would have no group to join
		if ( other === undefined ) {
			return;
		}

		var tabCount = content.childNodes.length - 1;

		if ( tabCount > 0 && !window.confirm( 'Closing this Group will close the ' + tabCount + ' tab' + ( tabCount == 1 ? '' : 's' ) + ' within it' ) ) {
			return;
		}

		const tabIds = [];
		await tabs.forEach( async function( tab ) {
			if ( await tabs.getGroupId( tab.id ) == group.id ) {
				tabIds.push( tab.id );
			}
		} );

		if ( tabIds.length ) {
			await browser.tabs.remove( tabIds );

			// a beforeunload prompt can keep tabs open; keep their group then (upstream #27)
			const open = await browser.tabs.query( { currentWindow: true } );
			if ( open.some( tab => tabIds.includes( tab.id ) ) ) {
				return;
			}
		}

		if ( await groups.getActive() == group.id ) {
			await groups.setActive( other );
		}

		await groups.remove( group.id );
		removeGroupNode( group.id );
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
	input.addEventListener( 'input', function( event ) {
		groups.rename( group.id, this.value );
	}, false );
	// ----

	// move
	let moveStart = {}, initialPosition = {};
	header.addEventListener( 'mousedown', function( event ) {
		if ( event.button !== 0 ) {
			return;
		}

		moveStart = {
			x: event.clientX,
			y: event.clientY,
		};

		initialPosition = {
			x: group.rect.x * window.innerWidth,
			y: group.rect.y * window.innerHeight,
		}

		document.addEventListener( 'mousemove', moveHandler, false );
		document.addEventListener( 'mouseup', moveEndHandler, { once: true } );

		input.blur();
		window.getSelection().removeAllRanges();

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

	const moveEndHandler = function( event ) {
		if ( event.clientX === moveStart.x && event.clientY === moveStart.y ) {
			input.focus();
			input.select();
		}

		//event.preventDefault();
		event.stopPropagation();

		document.removeEventListener( 'mousemove', moveHandler, false );

		moveHandler( event );
		groups.save();
	};

	// resize
	let resizeStart = {}, windowWidth, windowHeight;
	bottom_right.addEventListener( 'mousedown', function( event ) {
		if ( event.button !== 0 ) {
			return;
		}

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
		groups.save();

		view.resizeDummy.style.opacity = 0;
		node.style.opacity = 1;
	};

	// sizes are frozen while the cursor is inside the group (see tabRemoved), re-fit on the way out
	node.addEventListener( 'mouseleave', () => updateGroupFit( group ), false );
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

	if ( tab.pinned ) {
		return;
	}

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

// tile layout for `amount` tiles in a width x height box
function computeFit( width, height, amount ) {
	var ratio = background.config.tab.ratio;
	var small = false;
	var scroll = false;

	var fit = getBestFit( {
		width: width,
		height: height,
		minWidth: background.config.tab.minWidth,
		maxWidth: background.config.tab.maxWidth,
		ratio: ratio,
		amount: amount,
	} );

	if ( fit.x == -1 || fit.y == -1 ) {
		ratio = 1;
		small = true;

		fit = getBestFit( {
			width: width,
			height: height,
			minWidth: 50,
			maxWidth: 99,
			ratio: ratio,
			amount: amount,
		} );
	}

	// still doesn't fit: smallest tiles and let the group scroll (upstream #139)
	if ( fit.x == -1 || fit.y == -1 ) {
		scroll = true;
		fit = { x: Math.max( 1, Math.floor( width / 50 ) ) };
	}

	var w = width / fit.x;

	return { x: fit.x, w: w, h: w * ratio, small: small, scroll: scroll };
}

// keepSize reuses the previous tile size so the remaining tiles slide into the gap
// without resizing, e.g. to close several neighbouring tabs without moving the mouse
function updateGroupFit( group, keepSize = false ) {
	requestAnimationFrame( () => {
		var node = groupNodes[ group.id ];
		if ( !node ) {
			return;
		}

		var childNodes = node.content.childNodes;

		node.tabCount.innerHTML = '';
		node.tabCount.appendChild( document.createTextNode( childNodes.length - 1 ) );

		if ( !keepSize || !node.fit ) {
			var rect = node.content.getBoundingClientRect();
			node.fit = computeFit( rect.width, rect.height, childNodes.length );
		}

		var fit = node.fit;

		if ( fit.scroll ) {
			node.content.classList.add( 'scroll' );
		} else {
			node.content.classList.remove( 'scroll' );
		}

		for ( var i = 0; i < childNodes.length; i++ ) {
			if ( fit.small ) {
				childNodes[ i ].classList.add( 'small' );
			} else {
				childNodes[ i ].classList.remove( 'small' );
			}

			childNodes[ i ].style.width = fit.w + 'px';
			childNodes[ i ].style.height = fit.h + 'px';
			childNodes[ i ].style.left = ( fit.w * ( i % fit.x ) ) + 'px';
			childNodes[ i ].style.top = ( fit.h * Math.floor( i / fit.x ) ) + 'px';
		}
	} );
}

// group chrome around the tiles: margin 5+5, border 1+1, content inset 5+5 / 28+5
const GROUP_PAD_X = 22, GROUP_PAD_Y = 45, GROUP_MIN_W = 150, GROUP_MIN_H = 100;

// Splits width x height into one cell per group (tile counts in `counts`, in display order).
// Tries every row count and a few ways of sharing space by tab count, and keeps the
// layout whose smallest tab thumbnail is biggest (average thumbnail breaks ties).
function planLayout( counts, width, height ) {
	const n = counts.length;
	const weightings = [ c => 1, c => Math.sqrt( c ), c => c ];

	var best, bestScore = -Infinity;

	for ( let r = 1; r <= n; r++ ) {
		// r contiguous rows whose lengths differ by at most one
		const rows = [];
		for ( let i = 0, start = 0; i < r; i++ ) {
			const len = Math.floor( n / r ) + ( i < n % r ? 1 : 0 );
			rows.push( counts.slice( start, start + len ).map( ( c, j ) => ( { i: start + j, c: c } ) ) );
			start += len;
		}

		for ( const weight of weightings ) {
			const rowWeight = row => row.reduce( ( sum, cell ) => sum + weight( cell.c ), 0 );
			const total = rows.reduce( ( sum, row ) => sum + rowWeight( row ), 0 );

			const cells = [];
			let min = Infinity, sum = 0, y = 0;

			for ( const row of rows ) {
				const rw = rowWeight( row );
				const rh = height * rw / total;
				let x = 0;

				for ( const cell of row ) {
					const cw = width * weight( cell.c ) / rw;
					cells[ cell.i ] = { x: x, y: y, w: cw, h: rh };

					let score = -1;
					if ( cw >= GROUP_MIN_W && rh >= GROUP_MIN_H ) {
						const fit = computeFit( cw - GROUP_PAD_X, rh - GROUP_PAD_Y, cell.c );
						score = fit.scroll ? 0 : fit.w;
					}
					min = Math.min( min, score );
					sum += score;
					x += cw;
				}
				y += rh;
			}

			const score = min + sum / n / 1000;
			if ( score > bestScore ) {
				bestScore = score;
				best = cells;
			}
		}
	}

	return best;
}

function autoLayout() {
	const list = [];
	groups.forEach( group => list.push( group ) );

	// keep the current reading order: rows (by quarter of the screen), then left to right
	list.sort( ( a, b ) => ( Math.round( a.rect.y * 4 ) - Math.round( b.rect.y * 4 ) ) || ( a.rect.x - b.rect.x ) );

	const cells = planLayout(
		list.map( group => groupNodes[ group.id ].content.childNodes.length ),
		view.groupsNode.clientWidth,
		view.groupsNode.clientHeight
	);

	list.forEach( ( group, i ) => {
		const cell = cells[ i ];

		// the cell includes the group's 5px margin and 1px border on each side
		Object.assign( group.rect, {
			x: view.pxToWidth( cell.x ),
			y: view.pxToHeight( cell.y ),
			w: view.pxToWidth( cell.w - 12 ),
			h: view.pxToHeight( cell.h - 12 ),
		} );

		moveGroup( group );
		resizeGroup( group );
		updateGroupFit( group );
	} );

	groups.save();
}
