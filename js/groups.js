
'use strict';

const groups = (function(){

	var windowId;
	var groups;

	var func = {
		save: async function() {
			await browser.sessions.setWindowValue(windowId, 'groups', groups);
		},
		newUid: async function() {
			var groupIndex = (await browser.sessions.getWindowValue(windowId, 'groupIndex'));

			var uid = groupIndex || 0;
			var newGroupIndex = uid + 1;

			await browser.sessions.setWindowValue(windowId, 'groupIndex', newGroupIndex);

			return uid;
		},
		getIndex: function(id) {
			for(var i in groups) {
				if(groups[i].id == id) {
					return i;
				}
			}
			return -1;
		}
	};

	return {
		init: async function() {

			windowId = (await browser.windows.getCurrent()).id;
			groups = (await browser.sessions.getWindowValue(windowId, 'groups'));

			for(var i in groups) {
				groups[i].tabCount = 0;
			}
		},

		create: async function() {
			var group = {
				id: await func.newUid(),
				name: 'Unnamed Group',
				windowId: windowId,
				containerId: 'firefox-default',
				rect: {x: 0, y: 0, w: 0.25, h: 0.5},
				tabCount: 0,
			};
			groups.push(group);

			await func.save();

			return group;
		},

		remove: async function(id) {
			var index = func.getIndex(id);
			if(index == -1) {
				return;
			}
			groups.splice(index, 1);

			await func.save();
		},

		rename: async function(id, newName) {
			var index = func.getIndex(id);
			if(index == -1) {
				return;
			}
			groups[index].name = newName;

			await func.save();
		},

		getActive: async function() {
			return await browser.sessions.getWindowValue(windowId, 'activeGroup');
		},

		setActive: async function(id) {
			await browser.sessions.setWindowValue(windowId, 'activeGroup', id);

			view.tabs.forEach(async function( tab ) {
				var groupId = await view.tabs.getGroupId( tab.id );

				if ( groupId != id ) {
					browser.tabs.hide(tab.id);
				} else {
					browser.tabs.show(tab.id);
				}
			});

			console.log( 'set active group:', id );
		},

		get: function(id) {
			var index = func.getIndex(id);
			if(index == -1) {
				return;
			}
			return groups[index];
		},

		forEach: function(callback) {
			for(var i in groups) {
				callback(groups[i]);
			}
		},
	};
})();
