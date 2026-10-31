// `web-ext run` launches Firefox with the add-on and reloads it on every file change.
// `web-ext build` writes the .zip to web-ext-artifacts/, `web-ext lint` validates it.
module.exports = {
	ignoreFiles: [ 'README.md', 'LICENSE', 'web-ext-config.js', '.dev-profile', 'web-ext-artifacts' ],
	run: {
		// persistent dev profile: groups live in session data, which a throwaway profile loses
		// absolute path: a bare name is passed as `-P name` and Firefox looks it up in profiles.ini
		firefoxProfile: require( 'path' ).join( __dirname, '.dev-profile' ),
		profileCreateIfMissing: true,
		keepProfileChanges: true,
		browserConsole: true,
	},
};
