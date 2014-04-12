

(function(){


  var root = this;

  var previousBackbone = root.Backbone;

  var splice = Array.prototype.splice;

  var Backbone;
  if (typeof exports !== 'undefined') {
    Backbone = exports;
  } else {
    Backbone = root.Backbone = {};
  }

  Backbone.VERSION = '0.9.2';

  var _ = root._;
  if (!_ && (typeof require !== 'undefined')) _ = require('underscore');

  Backbone.$ = root.jQuery || root.Zepto || root.ender;

  Backbone.noConflict = function() {
    root.Backbone = previousBackbone;
    return this;
  };

  Backbone.emulateHTTP = false;

  Backbone.emulateJSON = false;


  var eventSplitter = /\s+/;

  var Events = Backbone.Events = {

    on: function(events, callback, context) {
      var calls, event, list;
      if (!callback) return this;

      events = events.split(eventSplitter);
      calls = this._callbacks || (this._callbacks = {});

      while (event = events.shift()) {
        list = calls[event] || (calls[event] = []);
        list.push(callback, context);
      }

      return this;
    },

    off: function(events, callback, context) {
      var event, calls, list, i;

      if (!(calls = this._callbacks)) return this;
      if (!(events || callback || context)) {
        delete this._callbacks;
        return this;
      }

      events = events ? events.split(eventSplitter) : _.keys(calls);

      while (event = events.shift()) {
        if (!(list = calls[event]) || !(callback || context)) {
          delete calls[event];
          continue;
        }

        for (i = list.length - 2; i >= 0; i -= 2) {
          if (!(callback && list[i] !== callback || context && list[i + 1] !== context)) {
            list.splice(i, 2);
          }
        }
      }

      return this;
    },

    trigger: function(events) {
      var event, calls, list, i, length, args, all, rest;
      if (!(calls = this._callbacks)) return this;

      rest = [];
      events = events.split(eventSplitter);

      for (i = 1, length = arguments.length; i < length; i++) {
        rest[i - 1] = arguments[i];
      }

      while (event = events.shift()) {
        if (all = calls.all) all = all.slice();
        if (list = calls[event]) list = list.slice();

        if (list) {
          for (i = 0, length = list.length; i < length; i += 2) {
            list[i].apply(list[i + 1] || this, rest);
          }
        }

        if (all) {
          args = [event].concat(rest);
          for (i = 0, length = all.length; i < length; i += 2) {
            all[i].apply(all[i + 1] || this, args);
          }
        }
      }

      return this;
    }

  };

  Events.bind   = Events.on;
  Events.unbind = Events.off;


  var Model = Backbone.Model = function(attributes, options) {
    var defaults;
    attributes || (attributes = {});
    if (options && options.collection) this.collection = options.collection;
    if (options && options.parse) attributes = this.parse(attributes);
    if (defaults = _.result(this, 'defaults')) {
      attributes = _.extend({}, defaults, attributes);
    }
    this.attributes = {};
    this._escapedAttributes = {};
    this.cid = _.uniqueId('c');
    this.changed = {};
    this._silent = {};
    this._pending = {};
    this.set(attributes, {silent: true});
    this.changed = {};
    this._silent = {};
    this._pending = {};
    this._previousAttributes = _.clone(this.attributes);
    this.initialize.apply(this, arguments);
  };

  _.extend(Model.prototype, Events, {

    changed: null,

    _silent: null,

    _pending: null,

    idAttribute: 'id',

    initialize: function(){},

    toJSON: function(options) {
      return _.clone(this.attributes);
    },

    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    get: function(attr) {
      return this.attributes[attr];
    },

    escape: function(attr) {
      var html;
      if (html = this._escapedAttributes[attr]) return html;
      var val = this.get(attr);
      return this._escapedAttributes[attr] = _.escape(val == null ? '' : '' + val);
    },

    has: function(attr) {
      return this.get(attr) != null;
    },

    set: function(key, value, options) {
      var attrs, attr, val;

      if (_.isObject(key) || key == null) {
        attrs = key;
        options = value;
      } else {
        attrs = {};
        attrs[key] = value;
      }

      options || (options = {});
      if (!attrs) return this;
      if (attrs instanceof Model) attrs = attrs.attributes;
      if (options.unset) for (attr in attrs) attrs[attr] = void 0;

      if (!this._validate(attrs, options)) return false;

      if (this.idAttribute in attrs) this.id = attrs[this.idAttribute];

      var changes = options.changes = {};
      var now = this.attributes;
      var escaped = this._escapedAttributes;
      var prev = this._previousAttributes || {};

      for (attr in attrs) {
        val = attrs[attr];

        if (!_.isEqual(now[attr], val) || (options.unset && _.has(now, attr))) {
          delete escaped[attr];
          (options.silent ? this._silent : changes)[attr] = true;
        }

        options.unset ? delete now[attr] : now[attr] = val;

        if (!_.isEqual(prev[attr], val) || (_.has(now, attr) !== _.has(prev, attr))) {
          this.changed[attr] = val;
          if (!options.silent) this._pending[attr] = true;
        } else {
          delete this.changed[attr];
          delete this._pending[attr];
        }
      }

      if (!options.silent) this.change(options);
      return this;
    },

    unset: function(attr, options) {
      options = _.extend({}, options, {unset: true});
      return this.set(attr, null, options);
    },

    clear: function(options) {
      options = _.extend({}, options, {unset: true});
      return this.set(_.clone(this.attributes), options);
    },

    fetch: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        if (!model.set(model.parse(resp, xhr), options)) return false;
        if (success) success(model, resp, options);
      };
      return this.sync('read', this, options);
    },

    save: function(key, value, options) {
      var attrs, current, done;

      if (_.isObject(key) || key == null) {
        attrs = key;
        options = value;
      } else {
        attrs = {};
        attrs[key] = value;
      }
      options = options ? _.clone(options) : {};

      if (options.wait) {
        if (!this._validate(attrs, options)) return false;
        current = _.clone(this.attributes);
      }

      var silentOptions = _.extend({}, options, {silent: true});
      if (attrs && !this.set(attrs, options.wait ? silentOptions : options)) {
        return false;
      }

      if (!attrs && !this.isValid()) return false;

      var model = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        done = true;
        var serverAttrs = model.parse(resp, xhr);
        if (options.wait) serverAttrs = _.extend(attrs || {}, serverAttrs);
        if (!model.set(serverAttrs, options)) return false;
        if (success) success(model, resp, options);
      };

      var xhr = this.sync(this.isNew() ? 'create' : 'update', this, options);

      if (!done && options.wait) {
        this.clear(silentOptions);
        this.set(current, silentOptions);
      }

      return xhr;
    },

    destroy: function(options) {
      options = options ? _.clone(options) : {};
      var model = this;
      var success = options.success;

      var destroy = function() {
        model.trigger('destroy', model, model.collection, options);
      };

      options.success = function(resp) {
        if (options.wait || model.isNew()) destroy();
        if (success) success(model, resp, options);
      };

      if (this.isNew()) {
        options.success();
        return false;
      }

      var xhr = this.sync('delete', this, options);
      if (!options.wait) destroy();
      return xhr;
    },

    url: function() {
      var base = _.result(this, 'urlRoot') || _.result(this.collection, 'url') || urlError();
      if (this.isNew()) return base;
      return base + (base.charAt(base.length - 1) === '/' ? '' : '/') + encodeURIComponent(this.id);
    },

    parse: function(resp, xhr) {
      return resp;
    },

    clone: function() {
      return new this.constructor(this.attributes);
    },

    isNew: function() {
      return this.id == null;
    },

    change: function(options) {
      options || (options = {});
      var changing = this._changing;
      this._changing = true;

      for (var attr in this._silent) this._pending[attr] = true;

      var changes = _.extend({}, options.changes, this._silent);
      this._silent = {};
      for (var attr in changes) {
        this.trigger('change:' + attr, this, this.get(attr), options);
      }
      if (changing) return this;

      while (!_.isEmpty(this._pending)) {
        this._pending = {};
        this.trigger('change', this, options);
        for (var attr in this.changed) {
          if (this._pending[attr] || this._silent[attr]) continue;
          delete this.changed[attr];
        }
        this._previousAttributes = _.clone(this.attributes);
      }

      this._changing = false;
      return this;
    },

    hasChanged: function(attr) {
      if (attr == null) return !_.isEmpty(this.changed);
      return _.has(this.changed, attr);
    },

    changedAttributes: function(diff) {
      if (!diff) return this.hasChanged() ? _.clone(this.changed) : false;
      var val, changed = false, old = this._previousAttributes;
      for (var attr in diff) {
        if (_.isEqual(old[attr], (val = diff[attr]))) continue;
        (changed || (changed = {}))[attr] = val;
      }
      return changed;
    },

    previous: function(attr) {
      if (attr == null || !this._previousAttributes) return null;
      return this._previousAttributes[attr];
    },

    previousAttributes: function() {
      return _.clone(this._previousAttributes);
    },

    isValid: function(options) {
      return !this.validate || !this.validate(this.attributes, options);
    },

    _validate: function(attrs, options) {
      if (options.silent || !this.validate) return true;
      attrs = _.extend({}, this.attributes, attrs);
      var error = this.validate(attrs, options);
      if (!error) return true;
      if (options && options.error) options.error(this, error, options);
      this.trigger('error', this, error, options);
      return false;
    }

  });


  var Collection = Backbone.Collection = function(models, options) {
    options || (options = {});
    if (options.model) this.model = options.model;
    if (options.comparator !== void 0) this.comparator = options.comparator;
    this._reset();
    this.initialize.apply(this, arguments);
    if (models) {
      if (options.parse) models = this.parse(models);
      this.reset(models, {silent: true, parse: options.parse});
    }
  };

  _.extend(Collection.prototype, Events, {

    model: Model,

    initialize: function(){},

    toJSON: function(options) {
      return this.map(function(model){ return model.toJSON(options); });
    },

    sync: function() {
      return Backbone.sync.apply(this, arguments);
    },

    add: function(models, options) {
      var i, index, length, model, cid, id, cids = {}, ids = {}, dups = [];
      options || (options = {});
      models = _.isArray(models) ? models.slice() : [models];

      for (i = 0, length = models.length; i < length; i++) {
        if (!(model = models[i] = this._prepareModel(models[i], options))) {
          throw new Error("Can't add an invalid model to a collection");
        }
        cid = model.cid;
        id = model.id;
        if (cids[cid] || this._byCid[cid] || ((id != null) && (ids[id] || this._byId[id]))) {
          dups.push(i);
          continue;
        }
        cids[cid] = ids[id] = model;
      }

      i = dups.length;
      while (i--) {
        dups[i] = models.splice(dups[i], 1)[0];
      }

      for (i = 0, length = models.length; i < length; i++) {
        (model = models[i]).on('all', this._onModelEvent, this);
        this._byCid[model.cid] = model;
        if (model.id != null) this._byId[model.id] = model;
      }

      this.length += length;
      index = options.at != null ? options.at : this.models.length;
      splice.apply(this.models, [index, 0].concat(models));

      if (options.merge) {
        for (i = 0, length = dups.length; i < length; i++) {
          if (model = this._byId[dups[i].id]) model.set(dups[i], options);
        }
      }

      if (this.comparator && options.at == null) this.sort({silent: true});

      if (options.silent) return this;
      for (i = 0, length = this.models.length; i < length; i++) {
        if (!cids[(model = this.models[i]).cid]) continue;
        options.index = i;
        model.trigger('add', model, this, options);
      }

      return this;
    },

    remove: function(models, options) {
      var i, l, index, model;
      options || (options = {});
      models = _.isArray(models) ? models.slice() : [models];
      for (i = 0, l = models.length; i < l; i++) {
        model = this.getByCid(models[i]) || this.get(models[i]);
        if (!model) continue;
        delete this._byId[model.id];
        delete this._byCid[model.cid];
        index = this.indexOf(model);
        this.models.splice(index, 1);
        this.length--;
        if (!options.silent) {
          options.index = index;
          model.trigger('remove', model, this, options);
        }
        this._removeReference(model);
      }
      return this;
    },

    push: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, options);
      return model;
    },

    pop: function(options) {
      var model = this.at(this.length - 1);
      this.remove(model, options);
      return model;
    },

    unshift: function(model, options) {
      model = this._prepareModel(model, options);
      this.add(model, _.extend({at: 0}, options));
      return model;
    },

    shift: function(options) {
      var model = this.at(0);
      this.remove(model, options);
      return model;
    },

    slice: function(begin, end) {
      return this.models.slice(begin, end);
    },

    get: function(id) {
      if (id == null) return void 0;
      return this._byId[id.id != null ? id.id : id];
    },

    getByCid: function(cid) {
      return cid && this._byCid[cid.cid || cid];
    },

    at: function(index) {
      return this.models[index];
    },

    where: function(attrs) {
      if (_.isEmpty(attrs)) return [];
      return this.filter(function(model) {
        for (var key in attrs) {
          if (attrs[key] !== model.get(key)) return false;
        }
        return true;
      });
    },

    sort: function(options) {
      options || (options = {});
      if (!this.comparator) throw new Error('Cannot sort a set without a comparator');
      var boundComparator = _.bind(this.comparator, this);
      if (this.comparator.length === 1) {
        this.models = this.sortBy(boundComparator);
      } else {
        this.models.sort(boundComparator);
      }
      if (!options.silent) this.trigger('reset', this, options);
      return this;
    },

    pluck: function(attr) {
      return _.map(this.models, function(model){ return model.get(attr); });
    },

    reset: function(models, options) {
      models  || (models = []);
      options || (options = {});
      for (var i = 0, l = this.models.length; i < l; i++) {
        this._removeReference(this.models[i]);
      }
      this._reset();
      this.add(models, _.extend({silent: true}, options));
      if (!options.silent) this.trigger('reset', this, options);
      return this;
    },

    fetch: function(options) {
      options = options ? _.clone(options) : {};
      if (options.parse === void 0) options.parse = true;
      var collection = this;
      var success = options.success;
      options.success = function(resp, status, xhr) {
        collection[options.add ? 'add' : 'reset'](collection.parse(resp, xhr), options);
        if (success) success(collection, resp, options);
      };
      return this.sync('read', this, options);
    },

    create: function(model, options) {
      var collection = this;
      options = options ? _.clone(options) : {};
      model = this._prepareModel(model, options);
      if (!model) return false;
      if (!options.wait) collection.add(model, options);
      var success = options.success;
      options.success = function(model, resp, options) {
        if (options.wait) collection.add(model, options);
        if (success) success(model, resp, options);
      };
      model.save(null, options);
      return model;
    },

    parse: function(resp, xhr) {
      return resp;
    },

    clone: function() {
      return new this.constructor(this.models);
    },

    chain: function() {
      return _(this.models).chain();
    },

    _reset: function(options) {
      this.length = 0;
      this.models = [];
      this._byId  = {};
      this._byCid = {};
    },

    _prepareModel: function(attrs, options) {
      if (attrs instanceof Model) {
        if (!attrs.collection) attrs.collection = this;
        return attrs;
      }
      options || (options = {});
      options.collection = this;
      var model = new this.model(attrs, options);
      if (!model._validate(model.attributes, options)) return false;
      return model;
    },

    _removeReference: function(model) {
      if (this === model.collection) delete model.collection;
      model.off('all', this._onModelEvent, this);
    },

    _onModelEvent: function(event, model, collection, options) {
      if ((event === 'add' || event === 'remove') && collection !== this) return;
      if (event === 'destroy') this.remove(model, options);
      if (model && event === 'change:' + model.idAttribute) {
        delete this._byId[model.previous(model.idAttribute)];
        if (model.id != null) this._byId[model.id] = model;
      }
      this.trigger.apply(this, arguments);
    }

  });

  var methods = ['forEach', 'each', 'map', 'collect', 'reduce', 'foldl',
    'inject', 'reduceRight', 'foldr', 'find', 'detect', 'filter', 'select',
    'reject', 'every', 'all', 'some', 'any', 'include', 'contains', 'invoke',
    'max', 'min', 'sortBy', 'sortedIndex', 'toArray', 'size', 'first', 'head',
    'take', 'initial', 'rest', 'tail', 'last', 'without', 'indexOf', 'shuffle',
    'lastIndexOf', 'isEmpty', 'groupBy'];

  _.each(methods, function(method) {
    Collection.prototype[method] = function() {
      return _[method].apply(_, [this.models].concat(_.toArray(arguments)));
    };
  });


  var Router = Backbone.Router = function(options) {
    options || (options = {});
    if (options.routes) this.routes = options.routes;
    this._bindRoutes();
    this.initialize.apply(this, arguments);
  };

  var namedParam    = /:\w+/g;
  var splatParam    = /\*\w+/g;
  var escapeRegExp  = /[-[\]{}()+?.,\\^$|#\s]/g;

  _.extend(Router.prototype, Events, {

    initialize: function(){},

    route: function(route, name, callback) {
      if (!_.isRegExp(route)) route = this._routeToRegExp(route);
      if (!callback) callback = this[name];
      Backbone.history.route(route, _.bind(function(fragment) {
        var args = this._extractParameters(route, fragment);
        callback && callback.apply(this, args);
        this.trigger.apply(this, ['route:' + name].concat(args));
        Backbone.history.trigger('route', this, name, args);
      }, this));
      return this;
    },

    navigate: function(fragment, options) {
      Backbone.history.navigate(fragment, options);
    },

    _bindRoutes: function() {
      if (!this.routes) return;
      var routes = [];
      for (var route in this.routes) {
        routes.unshift([route, this.routes[route]]);
      }
      for (var i = 0, l = routes.length; i < l; i++) {
        this.route(routes[i][0], routes[i][1], this[routes[i][1]]);
      }
    },

    _routeToRegExp: function(route) {
      route = route.replace(escapeRegExp, '\\$&')
                   .replace(namedParam, '([^\/]+)')
                   .replace(splatParam, '(.*?)');
      return new RegExp('^' + route + '$');
    },

    _extractParameters: function(route, fragment) {
      return route.exec(fragment).slice(1);
    }

  });


  var History = Backbone.History = function(options) {
    this.handlers = [];
    _.bindAll(this, 'checkUrl');
    this.location = options && options.location || root.location;
    this.history = options && options.history || root.history;
  };

  var routeStripper = /^[#\/]/;

  var isExplorer = /msie [\w.]+/;

  var trailingSlash = /\/$/;

  History.started = false;

  _.extend(History.prototype, Events, {

    interval: 50,

    getHash: function(window) {
      var match = (window || this).location.href.match(/#(.*)$/);
      return match ? match[1] : '';
    },

    getFragment: function(fragment, forcePushState) {
      if (fragment == null) {
        if (this._hasPushState || !this._wantsHashChange || forcePushState) {
          fragment = this.location.pathname;
          var root = this.options.root.replace(trailingSlash, '');
          if (!fragment.indexOf(root)) fragment = fragment.substr(root.length);
        } else {
          fragment = this.getHash();
        }
      }
      return decodeURIComponent(fragment.replace(routeStripper, ''));
    },

    start: function(options) {
      if (History.started) throw new Error("Backbone.history has already been started");
      History.started = true;

      this.options          = _.extend({}, {root: '/'}, this.options, options);
      this._wantsHashChange = this.options.hashChange !== false;
      this._wantsPushState  = !!this.options.pushState;
      this._hasPushState    = !!(this.options.pushState && this.history && this.history.pushState);
      var fragment          = this.getFragment();
      var docMode           = document.documentMode;
      var oldIE             = (isExplorer.exec(navigator.userAgent.toLowerCase()) && (!docMode || docMode <= 7));

      if (!trailingSlash.test(this.options.root)) this.options.root += '/';

      if (oldIE && this._wantsHashChange) {
        this.iframe = Backbone.$('<iframe src="javascript:0" tabindex="-1" />').hide().appendTo('body')[0].contentWindow;
        this.navigate(fragment);
      }

      if (this._hasPushState) {
        Backbone.$(window).bind('popstate', this.checkUrl);
      } else if (this._wantsHashChange && ('onhashchange' in window) && !oldIE) {
        Backbone.$(window).bind('hashchange', this.checkUrl);
      } else if (this._wantsHashChange) {
        this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
      }

      this.fragment = fragment;
      var loc = this.location;
      var atRoot = (loc.pathname.replace(/[^/]$/, '$&/') === this.options.root) && !loc.search;

      if (this._wantsHashChange && this._wantsPushState && !this._hasPushState && !atRoot) {
        this.fragment = this.getFragment(null, true);
        this.location.replace(this.options.root + this.location.search + '#' + this.fragment);
        return true;

      } else if (this._wantsPushState && this._hasPushState && atRoot && loc.hash) {
        this.fragment = this.getHash().replace(routeStripper, '');
      }

      if (!this.options.silent) return this.loadUrl();
    },

    stop: function() {
      Backbone.$(window).unbind('popstate', this.checkUrl).unbind('hashchange', this.checkUrl);
      clearInterval(this._checkUrlInterval);
      History.started = false;
    },

    route: function(route, callback) {
      this.handlers.unshift({route: route, callback: callback});
    },

    checkUrl: function(e) {
      var current = this.getFragment();
      if (current === this.fragment && this.iframe) {
        current = this.getFragment(this.getHash(this.iframe));
      }
      if (current === this.fragment) return false;
      if (this.iframe) this.navigate(current);
      this.loadUrl() || this.loadUrl(this.getHash());
    },

    loadUrl: function(fragmentOverride) {
      var fragment = this.fragment = this.getFragment(fragmentOverride);
      var matched = _.any(this.handlers, function(handler) {
        if (handler.route.test(fragment)) {
          handler.callback(fragment);
          return true;
        }
      });
      return matched;
    },

    navigate: function(fragment, options) {
      if (!History.started) return false;
      if (!options || options === true) options = {trigger: options};
      var frag = (fragment || '').replace(routeStripper, '');
      if (this.fragment === frag) return;
      this.fragment = frag;
      var url = (frag.indexOf(this.options.root) !== 0 ? this.options.root : '') + frag;

      if (this._hasPushState) {
        this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);

      } else if (this._wantsHashChange) {
        this._updateHash(this.location, frag, options.replace);
        if (this.iframe && (frag !== this.getFragment(this.getHash(this.iframe)))) {
          if(!options.replace) this.iframe.document.open().close();
          this._updateHash(this.iframe.location, frag, options.replace);
        }

      } else {
        return this.location.assign(url);
      }
      if (options.trigger) this.loadUrl(fragment);
    },

    _updateHash: function(location, fragment, replace) {
      if (replace) {
        location.replace(location.href.replace(/(javascript:|#).*$/, '') + '#' + fragment);
      } else {
        location.hash = fragment;
      }
    }

  });

  Backbone.history = new History;


  var View = Backbone.View = function(options) {
    this.cid = _.uniqueId('view');
    this._configure(options || {});
    this._ensureElement();
    this.initialize.apply(this, arguments);
    this.delegateEvents();
  };

  var delegateEventSplitter = /^(\S+)\s*(.*)$/;

  var viewOptions = ['model', 'collection', 'el', 'id', 'attributes', 'className', 'tagName'];

  _.extend(View.prototype, Events, {

    tagName: 'div',

    $: function(selector) {
      return this.$el.find(selector);
    },

    initialize: function(){},

    render: function() {
      return this;
    },

    dispose: function() {
      this.undelegateEvents();
      if (this.model) this.model.off(null, null, this);
      if (this.collection) this.collection.off(null, null, this);
      return this;
    },

    remove: function() {
      this.dispose();
      this.$el.remove();
      return this;
    },

    make: function(tagName, attributes, content) {
      var el = document.createElement(tagName);
      if (attributes) Backbone.$(el).attr(attributes);
      if (content != null) Backbone.$(el).html(content);
      return el;
    },

    setElement: function(element, delegate) {
      if (this.$el) this.undelegateEvents();
      this.$el = element instanceof Backbone.$ ? element : Backbone.$(element);
      this.el = this.$el[0];
      if (delegate !== false) this.delegateEvents();
      return this;
    },

    delegateEvents: function(events) {
      if (!(events || (events = _.result(this, 'events')))) return;
      this.undelegateEvents();
      for (var key in events) {
        var method = events[key];
        if (!_.isFunction(method)) method = this[events[key]];
        if (!method) throw new Error('Method "' + events[key] + '" does not exist');
        var match = key.match(delegateEventSplitter);
        var eventName = match[1], selector = match[2];
        method = _.bind(method, this);
        eventName += '.delegateEvents' + this.cid;
        if (selector === '') {
          this.$el.bind(eventName, method);
        } else {
          this.$el.delegate(selector, eventName, method);
        }
      }
    },

    undelegateEvents: function() {
      this.$el.unbind('.delegateEvents' + this.cid);
    },

    _configure: function(options) {
      if (this.options) options = _.extend({}, this.options, options);
      for (var i = 0, l = viewOptions.length; i < l; i++) {
        var attr = viewOptions[i];
        if (options[attr]) this[attr] = options[attr];
      }
      this.options = options;
    },

    _ensureElement: function() {
      if (!this.el) {
        var attrs = _.extend({}, _.result(this, 'attributes'));
        if (this.id) attrs.id = _.result(this, 'id');
        if (this.className) attrs['class'] = _.result(this, 'className');
        this.setElement(this.make(_.result(this, 'tagName'), attrs), false);
      } else {
        this.setElement(this.el, false);
      }
    }

  });


  var methodMap = {
    'create': 'POST',
    'update': 'PUT',
    'delete': 'DELETE',
    'read':   'GET'
  };

  Backbone.sync = function(method, model, options) {
    var type = methodMap[method];

    options || (options = {});

    var params = {type: type, dataType: 'json'};

    if (!options.url) {
      params.url = _.result(model, 'url') || urlError();
    }

    if (!options.data && model && (method === 'create' || method === 'update')) {
      params.contentType = 'application/json';
      params.data = JSON.stringify(model);
    }

    if (Backbone.emulateJSON) {
      params.contentType = 'application/x-www-form-urlencoded';
      params.data = params.data ? {model: params.data} : {};
    }

    if (Backbone.emulateHTTP) {
      if (type === 'PUT' || type === 'DELETE') {
        if (Backbone.emulateJSON) params.data._method = type;
        params.type = 'POST';
        params.beforeSend = function(xhr) {
          xhr.setRequestHeader('X-HTTP-Method-Override', type);
        };
      }
    }

    if (params.type !== 'GET' && !Backbone.emulateJSON) {
      params.processData = false;
    }

    var success = options.success;
    options.success = function(resp, status, xhr) {
      if (success) success(resp, status, xhr);
      model.trigger('sync', model, resp, options);
    };

    var error = options.error;
    options.error = function(xhr, status, thrown) {
      if (error) error(model, xhr, options);
      model.trigger('error', model, xhr, options);
    };

    return Backbone.ajax(_.extend(params, options));
  };

  Backbone.ajax = function() {
    return Backbone.$.ajax.apply(Backbone.$, arguments);
  };


  var extend = function(protoProps, staticProps) {
    var parent = this;
    var child;

    if (protoProps && _.has(protoProps, 'constructor')) {
      child = protoProps.constructor;
    } else {
      child = function(){ parent.apply(this, arguments); };
    }

    function Surrogate(){ this.constructor = child; };
    Surrogate.prototype = parent.prototype;
    child.prototype = new Surrogate;

    if (protoProps) _.extend(child.prototype, protoProps);

    _.extend(child, parent, staticProps);

    child.__super__ = parent.prototype;

    return child;
  };

  Model.extend = Collection.extend = Router.extend = View.extend = extend;

  var urlError = function() {
    throw new Error('A "url" property or function must be specified');
  };

}).call(this);
