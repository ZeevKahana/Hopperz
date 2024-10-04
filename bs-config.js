module.exports = {
    server: {
        baseDir: "./",
        index: "hopz.html"
    },
    files: ["*.html", "*.js", "*.css"],
    open: false,
    notify: false,
    port: 3001,
    middleware: [
        function(req, res, next) {
            res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; img-src 'self' data: http://localhost:3001; connect-src 'self' ws://localhost:3001");
            next();
        }
    ]
};