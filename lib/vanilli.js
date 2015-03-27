var _ = require('lodash'),
    vanilliServer = require('./vanilli/server'),
    stubRegistry = require('./vanilli/stub-registry'),
    bunyan = require('bunyan'),
    singleton;

function Vanilli(config) {

    var server,
        safeConfig = config || {},
        log = bunyan.createLogger({
            name: "vanilli",
            level: safeConfig.logLevel || "error"
        }),
        registry = stubRegistry.create({
            log: log
        });

    function argsToArray(args) {
        return Array.prototype.slice.call(args, 0);
    }

    function unwrapRegExp(value) {
        if (value instanceof RegExp) {
            return { regex: value.source };
        } else {
            return value;
        }
    }

    function stringifyNonJsonContent(contentBlob) {
        if (_.isObject(contentBlob.body) && (contentBlob.contentType !== "application/json")) {
            return _.merge(contentBlob, {
                body: JSON.stringify(contentBlob.body)
            });
        } else {
            return contentBlob;
        }
    }

    function failBodyWithNoContentType(contentBlob) {
        if (contentBlob.body && !contentBlob.contentType) {
            throw new Error("Body was specified for but content-type was missing.");
        }
    }

    function respondWith(status, options) {
        var safeOpts = _.clone(options) || {};

        if (!status) {
            throw new Error("Status code is missing.");
        }

        failBodyWithNoContentType(safeOpts);

        return _.merge(this, {
            response: stringifyNonJsonContent({
                status: status,
                contentType: safeOpts.contentType,
                body: safeOpts.body,
                headers: safeOpts.headers
            }),
            times: _.isNumber(safeOpts.times) ? safeOpts.times : 1
        });
    }

    function wait(milliseconds) {
        return _.merge(this, {
            response: {
                wait: milliseconds
            }
        });
    }

    function capture(captureId) {
        return _.merge(this, {
            captureId: captureId
        });
    }

    function onRequest(method, url, options) {
        var safeOpts = _.clone(options, true) || {};

        if (!url) {
            throw new Error("Url is missing.");
        }

        failBodyWithNoContentType(safeOpts);

        var stub = {
            criteria: stringifyNonJsonContent({
                method: method,
                url: unwrapRegExp(url),
                contentType: safeOpts.contentType,
                body: unwrapRegExp(safeOpts.body),
                query: _.mapValues(safeOpts.query, unwrapRegExp),
                headers: _.mapValues(safeOpts.headers, unwrapRegExp)
            }),
            priority: safeOpts.priority,
        };

        return _.merge(stub, {
            respondWith: _.bind(respondWith, stub),
            wait: _.bind(wait, stub),
            capture: _.bind(capture, stub)
        });
    }

    /**
     * Starts the vanilli REST API listening on the specified port.
     *
     * @returns This vanilli instance.
     */
    this.listen = function (port) {
        if (!port) {
            throw new Error("config.port must be specified.");
        }

        if (!registry || !log) {
            throw new Error("Vanilli.init must be called before starting.");
        }

        server = vanilliServer.start(
            _.merge(safeConfig, {
                port: port,
                registry: registry,
                log: log
            }));

        return this;
    };

    /**
     * Stops the vanilli REST API.
     */
    this.stop = function () {
        server.stop();
    };

    /**
     * Register one or more stubs.
     */
    this.stub = function () {
        return argsToArray(arguments)
            .map(registry.addStub);
    };

    /**
     * Register one or more expectations.
     */
    this.expect = function () {
        var stubToExpectation = _.partialRight(_.merge, { expect: true });

        return argsToArray(arguments)
            .map(stubToExpectation)
            .map(registry.addStub);
    };

    /**
     * Clears down the stub registry of all stubs and expectations.
     */
    this.clear = registry.clear;

    /**
     * Verifies the expectations registered in the stub registry have been met.
     *
     * @returns Array of error messages.
     */
    this.verify = function () {
        var errors = registry.verifyExpectations();

        if (errors.length > 0) {
            log.error(errors, "VERIFICATION FAILED");
            throw new Error(errors.join(", "));
        }
    };

    /**
     * Retrieves the details of the response stored against the specified capture id.
     *
     * @returns {*}
     */
    this.getCapture = function (captureId) {
        return registry.getCapture(captureId);
    };

    /**
     * Creates a stub with criteria based on an HTTP GET for the specified relative URL.
     *
     * @returns The new stub definition
     */
    this.onGet = _.partial(onRequest, "GET");

    /**
     * Creates a stub with criteria based on an HTTP POST for the specified relative URL.
     *
     * @returns The new stub definition
     */
    this.onPost = _.partial(onRequest, "POST");

    /**
     * Creates a stub with criteria based on an HTTP PUT for the specified relative URL.
     *
     * @returns The new stub definition
     */
    this.onPut = _.partial(onRequest, "PUT");

    /**
     * Creates a stub with criteria based on an HTTP DELETE for the specified relative URL.
     *
     * @returns The new stub definition
     */
    this.onDelete = _.partial(onRequest, "DELETE");
}

exports.init = function (config) {
    return new Vanilli(config);
};

exports.instance = function () {
    return singleton;
};
