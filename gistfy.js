var PORT = process.env.OPENSHIFT_NODEJS_PORT || 3000,
    IP_ADDRESS = process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1',
    BASE_URL = 'http://localhost:3000';

var express = require('express'),
    fs = require('fs'),
    hljs = require('highlight.js'),
    https = require('https'),
    swig  = require('swig'),
    url = require('url');

var app = express(),
    template = swig.compileFile('template.html');


String.prototype.format = function () {
    var s = this.toString();

    for (var i = 0; i < arguments.length; i++) {
        var re = new RegExp('\\{' + i + '\\}', 'gm');
        s = s.replace(re, arguments[i]);
    }

    return s;
};

/*

https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String

*/
Object.defineProperty(String.prototype, 'startsWith', {
    enumerable: false,
    configurable: false,
    writable: false,
    value: function (searchString, position) {
        position = position || 0;
        return this.lastIndexOf(searchString, position) === position;
    }
});

Object.defineProperty(String.prototype, 'endsWith', {
    value: function (searchString, position) {
        var subjectString = this.toString();
        if (position === undefined || position > subjectString.length) {
            position = subjectString.length;
        }
        position -= searchString.length;
        var lastIndex = subjectString.indexOf(searchString, position);
        return lastIndex !== -1 && lastIndex === position;
    }
});

function escapeJS(s) {
    return s.replace(/\n/g, '\\n').replace(/\'/g, '\\\'').replace(/\"/g, '\\\"');
}

function highlight(code, language) {
    if (language) {
        return hljs.highlight(language, code).value;
    } else {
        return hljs.highlightAuto(code).value;
    }
}

function range(low, high) {
    var list = [];
    for (var i = low; i <= high; i++) {
        list.push(i);
    }
    return list;
}

function downloadFile(urlStr, callback) {
    var options = url.parse(urlStr);

    options.headers = {
        'User-Agent': 'Gistfy-App 0.1.0'
    };

    https.get(options, function (response) {
        response.setEncoding('utf8');

        var body = '';

        response.on('data', function (chunk) {
            body += chunk;
        });

        response.on('end', function () {
            callback(body);
        });

    }).on('error', function (e) {
        // TODO:
    });
}

function downloadJSON(url, callback) {
    downloadFile(url, function (data) {
        callback(JSON.parse(data));
    });
}

function buildJS(options) {
    return 'document.write(\'<link rel=\"stylesheet\" href=\"' + BASE_URL + '/gistfy.css\">\');\n'+
           'document.write(\'' + escapeJS(template(options)) + '\');';
}

function guessLanguage(file) {
    if (file) {
        // FIX ME: Doesn't work for all extensions. e.g. ".cpp".
        // http://highlightjs.readthedocs.org/en/latest/css-classes-reference.html
        return file.split('.').pop();
    } else {
        return null;
    }
}

app.get('/', function (req, res) {
    res.redirect('/index.html');
});

app.get('/github/gists/:id', function (req, res) {

    var url = 'https://api.github.com/gists/{0}'.format(req.params.id);
    // TODO:
    res.end();
});

/*

Optional parameters:
    slice
    lang
    locale
    theme
    extended
    branch
    changeset

*/
app.get('/:host/:user/:repo/:path(*)', function (req, res) {

    var host = req.params.host.toLowerCase(),
        path = req.params.path,
        repo = req.params.repo,
        user = req.params.user,
        branch = req.query.branch || 'master',
        changeset = req.query.changeset,
        extended = req.query.extended,
        lang = req.query.lang,
        //locale = req.query.locale || 'en',
        slice = req.query.slice,
        theme = req.query.theme || 'github',
        fileName = path.split('/').pop(),
        htmlUrl, rawUrl, repoUrl, from, to;


    if (host === 'github') {
        htmlUrl =  'https://github.com/{0}/{1}/blob/{2}/{3}'.format(user, repo, branch, path);
        rawUrl =  'https://raw.githubusercontent.com/{0}/{1}/{2}/{3}'.format(user, repo, branch, path);
        repoUrl = 'https://github.com/{0}/{1}'.format(user, repo);
    } else if (host === 'bitbucket') {
        if (!changeset) {
            // TODO: Return error.
        }

        rawUrl =  'https://api.bitbucket.org/1.0/repositories/{0}/{1}/raw/{2}/{3}'.format(user, repo, branch, path);
        htmlUrl =  'https://bitbucket.org/{0}/{1}/src/{2}/{3}?at={4}'.format(user, repo, changeset, path, branch);
        repoUrl = 'https://bitbucket.org/{0}/{1}'.format(user, repo);
    } else {
        res.end();
        return;
    }

    if (slice) {
        slice = slice.split(':');

        if (slice && slice.length === 2) {
            from = parseInt(slice.shift()) - 1;
            to = parseInt(slice.shift()) - 1;
        }
    }

    downloadFile(rawUrl, function (data) {

        if (data.startsWith('\n')) {
            data = data.substring(1);
        }

        if (data.endsWith('\n')) {
            data = data.substring(0, data.length - 1);
        }

        if (!(from >= 0 && to > 0)) {
            from = 0;
            to = data.split('\n').length - 1;
        } else {
            data = data.split('\n').slice(from, to + 1).join('\n');
        }

        data = highlight(data, lang || guessLanguage(fileName));

        var options = {
            files: [{
                htmlUrl: htmlUrl,
                rawUrl: rawUrl,
                fileName: fileName,
                content: data,
                lineRange: function () {
                    return range(from, to);
                }
            }],
            repoUrl: repoUrl,
            theme: theme,
            extended: extended
        };

        var js = buildJS(options);

        res.setHeader('content-type', 'text/javascript');
        res.send(js);
    });
});

app.get('/:file(*)', function(req, res, next) {

    fs.exists(req.params.file, function(exists) {
        if (exists) {
            res.sendFile(req.params.file, { root: __dirname });
        } else {
            res.sendStatus(404);
        }
    });
});

app.listen(PORT, IP_ADDRESS, function () {
    console.log('Listening on http://{0}:{1}'.format(IP_ADDRESS, PORT))
});