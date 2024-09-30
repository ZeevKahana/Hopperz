module.exports = {
    server: {
        baseDir: "./",
        index: "hopz.html",
        middleware: {
            1: require('helmet')({
                contentSecurityPolicy: {
                    useDefaults: true,
                    directives: {
                        "script-src": ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"]
                    }
                }
            })
        }
    },
    files: ["*.html", "*.js", "*.css"]
};
