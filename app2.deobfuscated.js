(function () {
  "use strict";

  var preactOptions;
  var list;
  var _0x406d2a;
  var _0x5406f9;
  var _0x4c3ef1;
  var _0x43d241;
  var _0x316685 = {};
  var _0x9d84c4 = [];
  var _0x322d6e = /acit|ex(?:s|g|n|p|$)|rph|grid|ows|mnc|ntw|ine[ch]|zoo|^ord|itera/i;
  function callback(_0x3f91a4, _0x3696bd) {
    for (var _0xb6f7ee in _0x3696bd) {
      _0x3f91a4[_0xb6f7ee] = _0x3696bd[_0xb6f7ee];
    }
    return _0x3f91a4;
  }
  function callback2(_0x53dc6d) {
    var parentNode = _0x53dc6d.parentNode;
    if (parentNode) {
      parentNode.removeChild(_0x53dc6d);
    }
  }
  function createElement(_0x7ee35d, _0x20f1ba, list4) {
    var _0xa6339d;
    var _0x48c719;
    var _0x4203c8;
    var _0x3452c4 = arguments;
    var _0x57b92b = {};
    for (_0x4203c8 in _0x20f1ba) {
      if (_0x4203c8 == "key") {
        _0xa6339d = _0x20f1ba[_0x4203c8];
      } else if (_0x4203c8 == "ref") {
        _0x48c719 = _0x20f1ba[_0x4203c8];
      } else {
        _0x57b92b[_0x4203c8] = _0x20f1ba[_0x4203c8];
      }
    }
    if (arguments.length > 3) {
      list4 = [list4];
      _0x4203c8 = 3;
      for (; _0x4203c8 < arguments.length; _0x4203c8++) {
        list4.push(_0x3452c4[_0x4203c8]);
      }
    }
    if (list4 != null) {
      _0x57b92b.children = list4;
    }
    if (typeof _0x7ee35d == "function" && _0x7ee35d.defaultProps != null) {
      for (_0x4203c8 in _0x7ee35d.defaultProps) {
        if (_0x57b92b[_0x4203c8] === undefined) {
          _0x57b92b[_0x4203c8] = _0x7ee35d.defaultProps[_0x4203c8];
        }
      }
    }
    return callback3(_0x7ee35d, _0x57b92b, _0xa6339d, _0x48c719, null);
  }
  function callback3(_0x311635, _0x2f960f, _0x2804a1, _0x3fecb4, _0x235b98) {
    var _0x326e2c = {
      type: _0x311635,
      props: _0x2f960f,
      key: _0x2804a1,
      ref: _0x3fecb4,
      __k: null,
      __: null,
      __b: 0,
      __e: null,
      __d: undefined,
      __c: null,
      __h: null,
      constructor: undefined,
      __v: _0x235b98
    };
    if (_0x235b98 == null) {
      _0x326e2c.__v = _0x326e2c;
    }
    if (preactOptions.vnode != null) {
      preactOptions.vnode(_0x326e2c);
    }
    return _0x326e2c;
  }
  function _0x1a6367(_0x403bd4) {
    return _0x403bd4.children;
  }
  function _0x6579ff(_0x1744cc, _0x22eb36) {
    this.props = _0x1744cc;
    this.context = _0x22eb36;
  }
  function callback4(_0x53ae95, _0x28ea70) {
    if (_0x28ea70 == null) {
      if (_0x53ae95.__) {
        return callback4(_0x53ae95.__, _0x53ae95.__.__k.indexOf(_0x53ae95) + 1);
      } else {
        return null;
      }
    }
    var _0x3446aa;
    for (; _0x28ea70 < _0x53ae95.__k.length; _0x28ea70++) {
      if ((_0x3446aa = _0x53ae95.__k[_0x28ea70]) != null && _0x3446aa.__e != null) {
        return _0x3446aa.__e;
      }
    }
    if (typeof _0x53ae95.type == "function") {
      return callback4(_0x53ae95);
    } else {
      return null;
    }
  }
  function callback5(_0x212da1) {
    var _0x1e6c54;
    var _0x4e7ab4;
    if ((_0x212da1 = _0x212da1.__) != null && _0x212da1.__c != null) {
      _0x212da1.__e = _0x212da1.__c.base = null;
      _0x1e6c54 = 0;
      for (; _0x1e6c54 < _0x212da1.__k.length; _0x1e6c54++) {
        if ((_0x4e7ab4 = _0x212da1.__k[_0x1e6c54]) != null && _0x4e7ab4.__e != null) {
          _0x212da1.__e = _0x212da1.__c.base = _0x4e7ab4.__e;
          break;
        }
      }
      return callback5(_0x212da1);
    }
  }
  function callback6(_0x5b79a9) {
    if (!_0x5b79a9.__d && (_0x5b79a9.__d = true) && list.push(_0x5b79a9) && !_0x154984.__r++ || _0x5406f9 !== preactOptions.debounceRendering) {
      ((_0x5406f9 = preactOptions.debounceRendering) || _0x406d2a)(_0x154984);
    }
  }
  function _0x154984() {
    var _0xbcb4e6;
    for (; _0x154984.__r = list.length;) {
      _0xbcb4e6 = list.sort(function (_0x51146d, _0x393279) {
        return _0x51146d.__v.__b - _0x393279.__v.__b;
      });
      list = [];
      _0xbcb4e6.some(function (_0xca27c7) {
        var _0x43f181;
        var _0x5e70d3;
        var _0x23fc47;
        var _0x337ebf;
        var _0x2c1c69;
        var _0x480b70;
        var _0x51eeb1;
        if (_0xca27c7.__d) {
          _0x480b70 = (_0x2c1c69 = (_0x43f181 = _0xca27c7).__v).__e;
          if (_0x51eeb1 = _0x43f181.__P) {
            _0x5e70d3 = [];
            (_0x23fc47 = callback({}, _0x2c1c69)).__v = _0x23fc47;
            _0x337ebf = callback13(_0x51eeb1, _0x2c1c69, _0x23fc47, _0x43f181.__n, _0x51eeb1.ownerSVGElement !== undefined, _0x2c1c69.__h != null ? [_0x480b70] : null, _0x5e70d3, _0x480b70 == null ? callback4(_0x2c1c69) : _0x480b70, _0x2c1c69.__h);
            callback14(_0x5e70d3, _0x2c1c69);
            if (_0x337ebf != _0x480b70) {
              callback5(_0x2c1c69);
            }
          }
        }
      });
    }
  }
  function callback7(_0x2e8ca3, list4, _0x403550, _0x1d255f, _0x37f344, _0x2c2d9d, list5, _0x2f3096, _0x4909bd, _0x51ba47) {
    var _0x5b04cd;
    var _0x3a4948;
    var _0x21032d;
    var _0x22f42d;
    var _0x2b46cc;
    var _0x4deee9;
    var list6;
    var list7 = _0x1d255f && _0x1d255f.__k || _0x9d84c4;
    var length = list7.length;
    if (_0x4909bd == _0x316685) {
      _0x4909bd = list5 != null ? list5[0] : length ? callback4(_0x1d255f, 0) : null;
    }
    _0x403550.__k = [];
    _0x5b04cd = 0;
    for (; _0x5b04cd < list4.length; _0x5b04cd++) {
      if ((_0x22f42d = _0x403550.__k[_0x5b04cd] = (_0x22f42d = list4[_0x5b04cd]) == null || typeof _0x22f42d == "boolean" ? null : typeof _0x22f42d == "string" || typeof _0x22f42d == "number" ? callback3(null, _0x22f42d, null, null, _0x22f42d) : Array.isArray(_0x22f42d) ? callback3(_0x1a6367, {
        children: _0x22f42d
      }, null, null, null) : _0x22f42d.__e != null || _0x22f42d.__c != null ? callback3(_0x22f42d.type, _0x22f42d.props, _0x22f42d.key, null, _0x22f42d.__v) : _0x22f42d) != null) {
        _0x22f42d.__ = _0x403550;
        _0x22f42d.__b = _0x403550.__b + 1;
        if ((_0x21032d = list7[_0x5b04cd]) === null || _0x21032d && _0x22f42d.key == _0x21032d.key && _0x22f42d.type === _0x21032d.type) {
          list7[_0x5b04cd] = undefined;
        } else {
          for (_0x3a4948 = 0; _0x3a4948 < length; _0x3a4948++) {
            if ((_0x21032d = list7[_0x3a4948]) && _0x22f42d.key == _0x21032d.key && _0x22f42d.type === _0x21032d.type) {
              list7[_0x3a4948] = undefined;
              break;
            }
            _0x21032d = null;
          }
        }
        _0x2b46cc = callback13(_0x2e8ca3, _0x22f42d, _0x21032d = _0x21032d || _0x316685, _0x37f344, _0x2c2d9d, list5, _0x2f3096, _0x4909bd, _0x51ba47);
        if ((_0x3a4948 = _0x22f42d.ref) && _0x21032d.ref != _0x3a4948) {
          list6 ||= [];
          if (_0x21032d.ref) {
            list6.push(_0x21032d.ref, null, _0x22f42d);
          }
          list6.push(_0x3a4948, _0x22f42d.__c || _0x2b46cc, _0x22f42d);
        }
        if (_0x2b46cc != null) {
          if (_0x4deee9 == null) {
            _0x4deee9 = _0x2b46cc;
          }
          _0x4909bd = callback8(_0x2e8ca3, _0x22f42d, _0x21032d, list7, list5, _0x2b46cc, _0x4909bd);
          if (_0x51ba47 || _0x403550.type != "option") {
            if (typeof _0x403550.type == "function") {
              _0x403550.__d = _0x4909bd;
            }
          } else {
            _0x2e8ca3.value = "";
          }
        } else if (_0x4909bd && _0x21032d.__e == _0x4909bd && _0x4909bd.parentNode != _0x2e8ca3) {
          _0x4909bd = callback4(_0x21032d);
        }
      }
    }
    _0x403550.__e = _0x4deee9;
    if (list5 != null && typeof _0x403550.type != "function") {
      for (_0x5b04cd = list5.length; _0x5b04cd--;) {
        if (list5[_0x5b04cd] != null) {
          callback2(list5[_0x5b04cd]);
        }
      }
    }
    for (_0x5b04cd = length; _0x5b04cd--;) {
      if (list7[_0x5b04cd] != null) {
        callback17(list7[_0x5b04cd], list7[_0x5b04cd]);
      }
    }
    if (list6) {
      for (_0x5b04cd = 0; _0x5b04cd < list6.length; _0x5b04cd++) {
        callback16(list6[_0x5b04cd], list6[++_0x5b04cd], list6[++_0x5b04cd]);
      }
    }
  }
  function callback8(element, _0x202a1b, _0x45dbcf, _0x51008e, _0x590606, _0x16b8ee, _0x45928d) {
    var _0x44321c;
    var _0x2b771e;
    var _0x371e16;
    if (_0x202a1b.__d !== undefined) {
      _0x44321c = _0x202a1b.__d;
      _0x202a1b.__d = undefined;
    } else if (_0x590606 == _0x45dbcf || _0x16b8ee != _0x45928d || _0x16b8ee.parentNode == null) {
      _0x48ed47: if (_0x45928d == null || _0x45928d.parentNode !== element) {
        element.appendChild(_0x16b8ee);
        _0x44321c = null;
      } else {
        _0x2b771e = _0x45928d;
        _0x371e16 = 0;
        for (; (_0x2b771e = _0x2b771e.nextSibling) && _0x371e16 < _0x51008e.length; _0x371e16 += 2) {
          if (_0x2b771e == _0x16b8ee) {
            break _0x48ed47;
          }
        }
        element.insertBefore(_0x16b8ee, _0x45928d);
        _0x44321c = _0x45928d;
      }
    }
    if (_0x44321c !== undefined) {
      return _0x44321c;
    } else {
      return _0x16b8ee.nextSibling;
    }
  }
  function callback9(_0x264e65, _0x1de6e4, _0x48da97, _0x3b8dff, _0x112eb7) {
    var _0x1067d5;
    for (_0x1067d5 in _0x48da97) {
      if (_0x1067d5 !== "children" && _0x1067d5 !== "key" && !(_0x1067d5 in _0x1de6e4)) {
        callback11(_0x264e65, _0x1067d5, null, _0x48da97[_0x1067d5], _0x3b8dff);
      }
    }
    for (_0x1067d5 in _0x1de6e4) {
      if ((!_0x112eb7 || typeof _0x1de6e4[_0x1067d5] == "function") && _0x1067d5 !== "children" && _0x1067d5 !== "key" && _0x1067d5 !== "value" && _0x1067d5 !== "checked" && _0x48da97[_0x1067d5] !== _0x1de6e4[_0x1067d5]) {
        callback11(_0x264e65, _0x1067d5, _0x1de6e4[_0x1067d5], _0x48da97[_0x1067d5], _0x3b8dff);
      }
    }
  }
  function callback10(_0x8caad3, _0x1e8e8c, _0x46b665) {
    if (_0x1e8e8c[0] === "-") {
      _0x8caad3.setProperty(_0x1e8e8c, _0x46b665);
    } else {
      _0x8caad3[_0x1e8e8c] = _0x46b665 == null ? "" : typeof _0x46b665 != "number" || _0x322d6e.test(_0x1e8e8c) ? _0x46b665 : _0x46b665 + "px";
    }
  }
  function callback11(element, _0x407e62, _0x1f1db3, _0x554518, _0x50a1f8) {
    var _0x4a9714;
    var _0x4234e0;
    var _0x34ecd5;
    if (_0x50a1f8 && _0x407e62 == "className") {
      _0x407e62 = "class";
    }
    if (_0x407e62 === "style") {
      if (typeof _0x1f1db3 == "string") {
        element.style.cssText = _0x1f1db3;
      } else {
        if (typeof _0x554518 == "string") {
          element.style.cssText = _0x554518 = "";
        }
        if (_0x554518) {
          for (_0x407e62 in _0x554518) {
            if (!_0x1f1db3 || !(_0x407e62 in _0x1f1db3)) {
              callback10(element.style, _0x407e62, "");
            }
          }
        }
        if (_0x1f1db3) {
          for (_0x407e62 in _0x1f1db3) {
            if (!_0x554518 || _0x1f1db3[_0x407e62] !== _0x554518[_0x407e62]) {
              callback10(element.style, _0x407e62, _0x1f1db3[_0x407e62]);
            }
          }
        }
      }
    } else if (_0x407e62[0] === "o" && _0x407e62[1] === "n") {
      _0x4a9714 = _0x407e62 !== (_0x407e62 = _0x407e62.replace(/Capture$/, ""));
      if ((_0x4234e0 = _0x407e62.toLowerCase()) in element) {
        _0x407e62 = _0x4234e0;
      }
      _0x407e62 = _0x407e62.slice(2);
      element.l ||= {};
      element.l[_0x407e62 + _0x4a9714] = _0x1f1db3;
      _0x34ecd5 = _0x4a9714 ? _0x1f7f09 : _0x17209f;
      if (_0x1f1db3) {
        if (!_0x554518) {
          element.addEventListener(_0x407e62, _0x34ecd5, _0x4a9714);
        }
      } else {
        element.removeEventListener(_0x407e62, _0x34ecd5, _0x4a9714);
      }
    } else if (_0x407e62 !== "list" && _0x407e62 !== "tagName" && _0x407e62 !== "form" && _0x407e62 !== "type" && _0x407e62 !== "size" && _0x407e62 !== "download" && _0x407e62 !== "href" && !_0x50a1f8 && _0x407e62 in element) {
      element[_0x407e62] = _0x1f1db3 == null ? "" : _0x1f1db3;
    } else if (typeof _0x1f1db3 != "function" && _0x407e62 !== "dangerouslySetInnerHTML") {
      if (_0x407e62 !== (_0x407e62 = _0x407e62.replace(/xlink:?/, ""))) {
        if (_0x1f1db3 == null || _0x1f1db3 === false) {
          element.removeAttributeNS("http://www.w3.org/1999/xlink", _0x407e62.toLowerCase());
        } else {
          element.setAttributeNS("http://www.w3.org/1999/xlink", _0x407e62.toLowerCase(), _0x1f1db3);
        }
      } else if (_0x1f1db3 == null || _0x1f1db3 === false && !/^ar/.test(_0x407e62)) {
        element.removeAttribute(_0x407e62);
      } else {
        element.setAttribute(_0x407e62, _0x1f1db3);
      }
    }
  }
  function _0x17209f(_0x2f73ae) {
    this.l[_0x2f73ae.type + false](preactOptions.event ? preactOptions.event(_0x2f73ae) : _0x2f73ae);
  }
  function _0x1f7f09(_0x39047b) {
    this.l[_0x39047b.type + true](preactOptions.event ? preactOptions.event(_0x39047b) : _0x39047b);
  }
  function callback12(_0x2182cf, _0x110832, _0x38e496) {
    var _0x254dda;
    var _0x1da704;
    for (_0x254dda = 0; _0x254dda < _0x2182cf.__k.length; _0x254dda++) {
      if (_0x1da704 = _0x2182cf.__k[_0x254dda]) {
        _0x1da704.__ = _0x2182cf;
        if (_0x1da704.__e) {
          if (typeof _0x1da704.type == "function" && _0x1da704.__k.length > 1) {
            callback12(_0x1da704, _0x110832, _0x38e496);
          }
          _0x110832 = callback8(_0x38e496, _0x1da704, _0x1da704, _0x2182cf.__k, null, _0x1da704.__e, _0x110832);
          if (typeof _0x2182cf.type == "function") {
            _0x2182cf.__d = _0x110832;
          }
        }
      }
    }
  }
  function callback13(_0x7a94f6, _0xcfc3de, _0x38d1c8, _0x57f96e, _0x30c4e7, list4, list5, _0x2d334e, _0x302602) {
    var _0xaa662;
    var _0x57ab31;
    var _0xdc95d7;
    var _0x490cde;
    var _0x4c08c1;
    var _0x496f8f;
    var _0x531bff;
    var _0x7c2e61;
    var _0x36dd0c;
    var _0x24bd6d;
    var _0x27f629;
    var type = _0xcfc3de.type;
    if (_0xcfc3de.constructor !== undefined) {
      return null;
    }
    if (_0x38d1c8.__h != null) {
      _0x302602 = _0x38d1c8.__h;
      _0x2d334e = _0xcfc3de.__e = _0x38d1c8.__e;
      _0xcfc3de.__h = null;
      list4 = [_0x2d334e];
    }
    if (_0xaa662 = preactOptions.__b) {
      _0xaa662(_0xcfc3de);
    }
    try {
      _0x38b1fe: if (typeof type == "function") {
        _0x7c2e61 = _0xcfc3de.props;
        _0x36dd0c = (_0xaa662 = type.contextType) && _0x57f96e[_0xaa662.__c];
        _0x24bd6d = _0xaa662 ? _0x36dd0c ? _0x36dd0c.props.value : _0xaa662.__ : _0x57f96e;
        if (_0x38d1c8.__c) {
          _0x531bff = (_0x57ab31 = _0xcfc3de.__c = _0x38d1c8.__c).__ = _0x57ab31.__E;
        } else {
          if ("prototype" in type && type.prototype.render) {
            _0xcfc3de.__c = _0x57ab31 = new type(_0x7c2e61, _0x24bd6d);
          } else {
            _0xcfc3de.__c = _0x57ab31 = new _0x6579ff(_0x7c2e61, _0x24bd6d);
            _0x57ab31.constructor = type;
            _0x57ab31.render = _0x6aab8d;
          }
          if (_0x36dd0c) {
            _0x36dd0c.sub(_0x57ab31);
          }
          _0x57ab31.props = _0x7c2e61;
          _0x57ab31.state ||= {};
          _0x57ab31.context = _0x24bd6d;
          _0x57ab31.__n = _0x57f96e;
          _0xdc95d7 = _0x57ab31.__d = true;
          _0x57ab31.__h = [];
        }
        if (_0x57ab31.__s == null) {
          _0x57ab31.__s = _0x57ab31.state;
        }
        if (type.getDerivedStateFromProps != null) {
          if (_0x57ab31.__s == _0x57ab31.state) {
            _0x57ab31.__s = callback({}, _0x57ab31.__s);
          }
          callback(_0x57ab31.__s, type.getDerivedStateFromProps(_0x7c2e61, _0x57ab31.__s));
        }
        _0x490cde = _0x57ab31.props;
        _0x4c08c1 = _0x57ab31.state;
        if (_0xdc95d7) {
          if (type.getDerivedStateFromProps == null && _0x57ab31.componentWillMount != null) {
            _0x57ab31.componentWillMount();
          }
          if (_0x57ab31.componentDidMount != null) {
            _0x57ab31.__h.push(_0x57ab31.componentDidMount);
          }
        } else {
          if (type.getDerivedStateFromProps == null && _0x7c2e61 !== _0x490cde && _0x57ab31.componentWillReceiveProps != null) {
            _0x57ab31.componentWillReceiveProps(_0x7c2e61, _0x24bd6d);
          }
          if (!_0x57ab31.__e && _0x57ab31.shouldComponentUpdate != null && _0x57ab31.shouldComponentUpdate(_0x7c2e61, _0x57ab31.__s, _0x24bd6d) === false || _0xcfc3de.__v === _0x38d1c8.__v) {
            _0x57ab31.props = _0x7c2e61;
            _0x57ab31.state = _0x57ab31.__s;
            if (_0xcfc3de.__v !== _0x38d1c8.__v) {
              _0x57ab31.__d = false;
            }
            _0x57ab31.__v = _0xcfc3de;
            _0xcfc3de.__e = _0x38d1c8.__e;
            _0xcfc3de.__k = _0x38d1c8.__k;
            if (_0x57ab31.__h.length) {
              list5.push(_0x57ab31);
            }
            callback12(_0xcfc3de, _0x2d334e, _0x7a94f6);
            break _0x38b1fe;
          }
          if (_0x57ab31.componentWillUpdate != null) {
            _0x57ab31.componentWillUpdate(_0x7c2e61, _0x57ab31.__s, _0x24bd6d);
          }
          if (_0x57ab31.componentDidUpdate != null) {
            _0x57ab31.__h.push(function () {
              _0x57ab31.componentDidUpdate(_0x490cde, _0x4c08c1, _0x496f8f);
            });
          }
        }
        _0x57ab31.context = _0x24bd6d;
        _0x57ab31.props = _0x7c2e61;
        _0x57ab31.state = _0x57ab31.__s;
        if (_0xaa662 = preactOptions.__r) {
          _0xaa662(_0xcfc3de);
        }
        _0x57ab31.__d = false;
        _0x57ab31.__v = _0xcfc3de;
        _0x57ab31.__P = _0x7a94f6;
        _0xaa662 = _0x57ab31.render(_0x57ab31.props, _0x57ab31.state, _0x57ab31.context);
        _0x57ab31.state = _0x57ab31.__s;
        if (_0x57ab31.getChildContext != null) {
          _0x57f96e = callback(callback({}, _0x57f96e), _0x57ab31.getChildContext());
        }
        if (!_0xdc95d7 && _0x57ab31.getSnapshotBeforeUpdate != null) {
          _0x496f8f = _0x57ab31.getSnapshotBeforeUpdate(_0x490cde, _0x4c08c1);
        }
        _0x27f629 = _0xaa662 != null && _0xaa662.type == _0x1a6367 && _0xaa662.key == null ? _0xaa662.props.children : _0xaa662;
        callback7(_0x7a94f6, Array.isArray(_0x27f629) ? _0x27f629 : [_0x27f629], _0xcfc3de, _0x38d1c8, _0x57f96e, _0x30c4e7, list4, list5, _0x2d334e, _0x302602);
        _0x57ab31.base = _0xcfc3de.__e;
        _0xcfc3de.__h = null;
        if (_0x57ab31.__h.length) {
          list5.push(_0x57ab31);
        }
        if (_0x531bff) {
          _0x57ab31.__E = _0x57ab31.__ = null;
        }
        _0x57ab31.__e = false;
      } else if (list4 == null && _0xcfc3de.__v === _0x38d1c8.__v) {
        _0xcfc3de.__k = _0x38d1c8.__k;
        _0xcfc3de.__e = _0x38d1c8.__e;
      } else {
        _0xcfc3de.__e = callback15(_0x38d1c8.__e, _0xcfc3de, _0x38d1c8, _0x57f96e, _0x30c4e7, list4, list5, _0x302602);
      }
      if (_0xaa662 = preactOptions.diffed) {
        _0xaa662(_0xcfc3de);
      }
    } catch (_0x4e08bd) {
      _0xcfc3de.__v = null;
      if (_0x302602 || list4 != null) {
        _0xcfc3de.__e = _0x2d334e;
        _0xcfc3de.__h = !!_0x302602;
        list4[list4.indexOf(_0x2d334e)] = null;
      }
      preactOptions.__e(_0x4e08bd, _0xcfc3de, _0x38d1c8);
    }
    return _0xcfc3de.__e;
  }
  function callback14(_0x1803c8, _0x12b46b) {
    if (preactOptions.__c) {
      preactOptions.__c(_0x12b46b, _0x1803c8);
    }
    _0x1803c8.some(function (_0x4ac934) {
      try {
        _0x1803c8 = _0x4ac934.__h;
        _0x4ac934.__h = [];
        _0x1803c8.some(function (_0x2cb868) {
          _0x2cb868.call(_0x4ac934);
        });
      } catch (_0x3c06b5) {
        preactOptions.__e(_0x3c06b5, _0x4ac934.__v);
      }
    });
  }
  function callback15(element, _0x3459df, _0xafaf5a, _0x4e97d6, _0xa64301, list4, _0x3f9ad6, _0x2a354f) {
    var _0x5e6fce;
    var _0x4b0e30;
    var _0x435245;
    var _0x588a70;
    var _0x3a51e6;
    var props = _0xafaf5a.props;
    var props2 = _0x3459df.props;
    _0xa64301 = _0x3459df.type === "svg" || _0xa64301;
    if (list4 != null) {
      for (_0x5e6fce = 0; _0x5e6fce < list4.length; _0x5e6fce++) {
        if ((_0x4b0e30 = list4[_0x5e6fce]) != null && ((_0x3459df.type === null ? _0x4b0e30.nodeType === 3 : _0x4b0e30.localName === _0x3459df.type) || element == _0x4b0e30)) {
          element = _0x4b0e30;
          list4[_0x5e6fce] = null;
          break;
        }
      }
    }
    if (element == null) {
      if (_0x3459df.type === null) {
        return document.createTextNode(props2);
      }
      element = _0xa64301 ? document.createElementNS("http://www.w3.org/2000/svg", _0x3459df.type) : document.createElement(_0x3459df.type, props2.is && {
        is: props2.is
      });
      list4 = null;
      _0x2a354f = false;
    }
    if (_0x3459df.type === null) {
      if (props !== props2 && (!_0x2a354f || element.data !== props2)) {
        element.data = props2;
      }
    } else {
      if (list4 != null) {
        list4 = _0x9d84c4.slice.call(element.childNodes);
      }
      _0x435245 = (props = _0xafaf5a.props || _0x316685).dangerouslySetInnerHTML;
      _0x588a70 = props2.dangerouslySetInnerHTML;
      if (!_0x2a354f) {
        if (list4 != null) {
          props = {};
          _0x3a51e6 = 0;
          for (; _0x3a51e6 < element.attributes.length; _0x3a51e6++) {
            props[element.attributes[_0x3a51e6].name] = element.attributes[_0x3a51e6].value;
          }
        }
        if (_0x588a70 || _0x435245) {
          if (!_0x588a70 || (!_0x435245 || _0x588a70.__html != _0x435245.__html) && _0x588a70.__html !== element.innerHTML) {
            element.innerHTML = _0x588a70 && _0x588a70.__html || "";
          }
        }
      }
      callback9(element, props2, props, _0xa64301, _0x2a354f);
      if (_0x588a70) {
        _0x3459df.__k = [];
      } else {
        _0x5e6fce = _0x3459df.props.children;
        callback7(element, Array.isArray(_0x5e6fce) ? _0x5e6fce : [_0x5e6fce], _0x3459df, _0xafaf5a, _0x4e97d6, _0x3459df.type !== "foreignObject" && _0xa64301, list4, _0x3f9ad6, _0x316685, _0x2a354f);
      }
      if (!_0x2a354f) {
        if ("value" in props2 && (_0x5e6fce = props2.value) !== undefined && (_0x5e6fce !== element.value || _0x3459df.type === "progress" && !_0x5e6fce)) {
          callback11(element, "value", _0x5e6fce, props.value, false);
        }
        if ("checked" in props2 && (_0x5e6fce = props2.checked) !== undefined && _0x5e6fce !== element.checked) {
          callback11(element, "checked", _0x5e6fce, props.checked, false);
        }
      }
    }
    return element;
  }
  function callback16(_0x52f145, _0x3013b5, _0x43abad) {
    try {
      if (typeof _0x52f145 == "function") {
        _0x52f145(_0x3013b5);
      } else {
        _0x52f145.current = _0x3013b5;
      }
    } catch (_0x3f9d12) {
      preactOptions.__e(_0x3f9d12, _0x43abad);
    }
  }
  function callback17(_0x5bcf77, _0x46fddb, _0x274471) {
    var list4;
    var _0x3a1192;
    var _0x463e59;
    if (preactOptions.unmount) {
      preactOptions.unmount(_0x5bcf77);
    }
    if (list4 = _0x5bcf77.ref) {
      if (!list4.current || list4.current === _0x5bcf77.__e) {
        callback16(list4, null, _0x46fddb);
      }
    }
    if (!_0x274471 && typeof _0x5bcf77.type != "function") {
      _0x274471 = (_0x3a1192 = _0x5bcf77.__e) != null;
    }
    _0x5bcf77.__e = _0x5bcf77.__d = undefined;
    if ((list4 = _0x5bcf77.__c) != null) {
      if (list4.componentWillUnmount) {
        try {
          list4.componentWillUnmount();
        } catch (_0x3ae80d) {
          preactOptions.__e(_0x3ae80d, _0x46fddb);
        }
      }
      list4.base = list4.__P = null;
    }
    if (list4 = _0x5bcf77.__k) {
      for (_0x463e59 = 0; _0x463e59 < list4.length; _0x463e59++) {
        if (list4[_0x463e59]) {
          callback17(list4[_0x463e59], _0x46fddb, _0x274471);
        }
      }
    }
    if (_0x3a1192 != null) {
      callback2(_0x3a1192);
    }
  }
  function _0x6aab8d(_0x2bb351, _0x136766, _0x4dac4a) {
    return this.constructor(_0x2bb351, _0x4dac4a);
  }
  function callback18(_0xe1b337, _0x4d1c6d, _0x21c44d) {
    var _0x2ebb7f;
    var _0x34cd7a;
    var _0x38dafe;
    if (preactOptions.__) {
      preactOptions.__(_0xe1b337, _0x4d1c6d);
    }
    _0x34cd7a = (_0x2ebb7f = _0x21c44d === _0x4c3ef1) ? null : _0x21c44d && _0x21c44d.__k || _0x4d1c6d.__k;
    _0xe1b337 = createElement(_0x1a6367, null, [_0xe1b337]);
    _0x38dafe = [];
    callback13(_0x4d1c6d, (_0x2ebb7f ? _0x4d1c6d : _0x21c44d || _0x4d1c6d).__k = _0xe1b337, _0x34cd7a || _0x316685, _0x316685, _0x4d1c6d.ownerSVGElement !== undefined, _0x21c44d && !_0x2ebb7f ? [_0x21c44d] : _0x34cd7a ? null : _0x4d1c6d.childNodes.length ? _0x9d84c4.slice.call(_0x4d1c6d.childNodes) : null, _0x38dafe, _0x21c44d || _0x316685, _0x2ebb7f);
    callback14(_0x38dafe, _0xe1b337);
  }
  function callback19(_0x5beed0, _0x33329b) {
    var _0x4e0e19 = {
      __c: _0x33329b = "__cC" + _0x43d241++,
      __: _0x5beed0,
      Consumer: function (_0x5c8130, _0x11d62d) {
        return _0x5c8130.children(_0x11d62d);
      },
      Provider: function (_0xfc529f, list4, _0x30fb1b) {
        if (!this.getChildContext) {
          list4 = [];
          (_0x30fb1b = {})[_0x33329b] = this;
          this.getChildContext = function () {
            return _0x30fb1b;
          };
          this.shouldComponentUpdate = function (_0x4a0131) {
            if (this.props.value !== _0x4a0131.value) {
              list4.some(callback6);
            }
          };
          this.sub = function (_0x54bd38) {
            list4.push(_0x54bd38);
            var componentWillUnmount = _0x54bd38.componentWillUnmount;
            _0x54bd38.componentWillUnmount = function () {
              list4.splice(list4.indexOf(_0x54bd38), 1);
              if (componentWillUnmount) {
                componentWillUnmount.call(_0x54bd38);
              }
            };
          };
        }
        return _0xfc529f.children;
      }
    };
    return _0x4e0e19.Provider.__ = _0x4e0e19.Consumer.contextType = _0x4e0e19;
  }
  preactOptions = {
    __e: function (_0x56617d, _0x4d6ef8) {
      var _0x261b62;
      var _0x1c0b4c;
      for (var _0x5c24e2, __h = _0x4d6ef8.__h; _0x4d6ef8 = _0x4d6ef8.__;) {
        if ((_0x261b62 = _0x4d6ef8.__c) && !_0x261b62.__) {
          try {
            if ((_0x1c0b4c = _0x261b62.constructor) && _0x1c0b4c.getDerivedStateFromError != null) {
              _0x261b62.setState(_0x1c0b4c.getDerivedStateFromError(_0x56617d));
              _0x5c24e2 = _0x261b62.__d;
            }
            if (_0x261b62.componentDidCatch != null) {
              _0x261b62.componentDidCatch(_0x56617d);
              _0x5c24e2 = _0x261b62.__d;
            }
            if (_0x5c24e2) {
              _0x4d6ef8.__h = __h;
              return _0x261b62.__E = _0x261b62;
            }
          } catch (_0x1af785) {
            _0x56617d = _0x1af785;
          }
        }
      }
      throw _0x56617d;
    }
  };
  _0x6579ff.prototype.setState = function (callback95, _0x10f265) {
    var _0x31ea93;
    _0x31ea93 = this.__s != null && this.__s !== this.state ? this.__s : this.__s = callback({}, this.state);
    if (typeof callback95 == "function") {
      callback95 = callback95(callback({}, _0x31ea93), this.props);
    }
    if (callback95) {
      callback(_0x31ea93, callback95);
    }
    if (callback95 != null && this.__v) {
      if (_0x10f265) {
        this.__h.push(_0x10f265);
      }
      callback6(this);
    }
  };
  _0x6579ff.prototype.forceUpdate = function (_0x4c9788) {
    if (this.__v) {
      this.__e = true;
      if (_0x4c9788) {
        this.__h.push(_0x4c9788);
      }
      callback6(this);
    }
  };
  _0x6579ff.prototype.render = _0x1a6367;
  list = [];
  _0x406d2a = typeof Promise == "function" ? Promise.prototype.then.bind(Promise.resolve()) : setTimeout;
  _0x154984.__r = 0;
  _0x4c3ef1 = _0x316685;
  _0x43d241 = 0;
  function callback20(callback95, _0x56a002) {
    _0x56a002 = {
      exports: {}
    };
    callback95(_0x56a002, _0x56a002.exports);
    return _0x56a002.exports;
  }
  var _0x480125 = callback20(function (_0x489395, _0x32ffe2) {
    (function (callback95) {
      var _0x38a1e2;
      {
        _0x489395.exports = callback95();
        _0x38a1e2 = true;
      }
      if (!_0x38a1e2) {
        var Cookies = window.Cookies;
        var _0x5b9e40 = window.Cookies = callback95();
        _0x5b9e40.noConflict = function () {
          window.Cookies = Cookies;
          return _0x5b9e40;
        };
      }
    })(function () {
      function callback95() {
        var i2 = 0;
        var _0x541af5 = {};
        for (; i2 < arguments.length; i2++) {
          var _0x231da7 = arguments[i2];
          for (var _0x37b533 in _0x231da7) {
            _0x541af5[_0x37b533] = _0x231da7[_0x37b533];
          }
        }
        return _0x541af5;
      }
      function callback96(_0x5776fd) {
        return _0x5776fd.replace(/(%[0-9A-Z]{2})+/g, decodeURIComponent);
      }
      function callback97(_0xa8c88) {
        function _0x316d13() {}
        function callback98(_0x5b7742, _0x41d11e, _0x5ddbc3) {
          if (typeof document === "undefined") {
            return;
          }
          _0x5ddbc3 = callback95({
            path: "/"
          }, _0x316d13.defaults, _0x5ddbc3);
          if (typeof _0x5ddbc3.expires === "number") {
            _0x5ddbc3.expires = new Date(new Date() * 1 + _0x5ddbc3.expires * 86400000);
          }
          _0x5ddbc3.expires = _0x5ddbc3.expires ? _0x5ddbc3.expires.toUTCString() : "";
          try {
            var _0x3c25e5 = JSON.stringify(_0x41d11e);
            if (/^[\{\[]/.test(_0x3c25e5)) {
              _0x41d11e = _0x3c25e5;
            }
          } catch (_0x556778) {}
          _0x41d11e = _0xa8c88.write ? _0xa8c88.write(_0x41d11e, _0x5b7742) : encodeURIComponent(String(_0x41d11e)).replace(/%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g, decodeURIComponent);
          _0x5b7742 = encodeURIComponent(String(_0x5b7742)).replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent).replace(/[\(\)]/g, escape);
          var _0x32de11 = "";
          for (var _0x3aa7f8 in _0x5ddbc3) {
            if (!_0x5ddbc3[_0x3aa7f8]) {
              continue;
            }
            _0x32de11 += "; " + _0x3aa7f8;
            if (_0x5ddbc3[_0x3aa7f8] === true) {
              continue;
            }
            _0x32de11 += "=" + _0x5ddbc3[_0x3aa7f8].split(";")[0];
          }
          return document.cookie = _0x5b7742 + "=" + _0x41d11e + _0x32de11;
        }
        function callback99(_0x5eafdb, _0x3b7cc9) {
          if (typeof document === "undefined") {
            return;
          }
          var _0x516511 = {};
          var list4 = document.cookie ? document.cookie.split("; ") : [];
          var i2 = 0;
          for (; i2 < list4.length; i2++) {
            var _0x517955 = list4[i2].split("=");
            var _0x482fd7 = _0x517955.slice(1).join("=");
            if (!_0x3b7cc9 && _0x482fd7.charAt(0) === "\"") {
              _0x482fd7 = _0x482fd7.slice(1, -1);
            }
            try {
              var _0x1b7fb2 = callback96(_0x517955[0]);
              _0x482fd7 = (_0xa8c88.read || _0xa8c88)(_0x482fd7, _0x1b7fb2) || callback96(_0x482fd7);
              if (_0x3b7cc9) {
                try {
                  _0x482fd7 = JSON.parse(_0x482fd7);
                } catch (_0x1ba30e) {}
              }
              _0x516511[_0x1b7fb2] = _0x482fd7;
              if (_0x5eafdb === _0x1b7fb2) {
                break;
              }
            } catch (_0x35f9bb) {}
          }
          if (_0x5eafdb) {
            return _0x516511[_0x5eafdb];
          } else {
            return _0x516511;
          }
        }
        _0x316d13.set = callback98;
        _0x316d13.get = function (_0x42280a) {
          return callback99(_0x42280a, false);
        };
        _0x316d13.getJSON = function (_0x280463) {
          return callback99(_0x280463, true);
        };
        _0x316d13.remove = function (_0x396dda, _0x3baebe) {
          callback98(_0x396dda, "", callback95(_0x3baebe, {
            expires: -1
          }));
        };
        _0x316d13.defaults = {};
        _0x316d13.withConverter = callback97;
        return _0x316d13;
      }
      return callback97(function () {});
    });
  });
  const _0x68ae04 = Math.pow(2, -26);
  const callback21 = _0x4232a1 => Math.abs(_0x4232a1) <= _0x68ae04;
  const callback22 = (_0x2bc84b, _0x422639) => Math.abs(_0x2bc84b - _0x422639) <= _0x68ae04;
  const callback23 = (_0x497e73, _0x1215fd, _0xc805ba) => _0x497e73 + (_0x1215fd - _0x497e73) * _0xc805ba;
  const callback24 = _0x570a19 => --_0x570a19 * _0x570a19 * _0x570a19 + 1;
  const callback25 = (_0x2cbd0e, _0x349ac0, _0x26617c) => {
    if (_0x26617c < _0x2cbd0e) {
      return _0x2cbd0e;
    }
    if (_0x26617c > _0x349ac0) {
      return _0x349ac0;
    }
    return _0x26617c;
  };
  const callback26 = (_0x485df3, _0x2a85fc, _0x18d0a3, _0x4b57d3) => _0x485df3 * _0x4b57d3 - _0x2a85fc * _0x18d0a3;
  const callback27 = (_0x50b329, _0x1b8016, _0x13f44a) => Math.min(_0x50b329, _0x1b8016) - _0x68ae04 <= _0x13f44a && _0x13f44a <= Math.max(_0x50b329, _0x1b8016) + _0x68ae04;
  const callback28 = (_0x398a2a, _0x88af21, _0x9eb278, _0x369d4a) => {
    if (_0x398a2a > _0x88af21) {
      [_0x398a2a, _0x88af21] = [_0x88af21, _0x398a2a];
    }
    if (_0x9eb278 > _0x369d4a) {
      [_0x9eb278, _0x369d4a] = [_0x369d4a, _0x9eb278];
    }
    return Math.min(_0x88af21, _0x369d4a) - Math.max(_0x398a2a, _0x9eb278);
  };
  function callback29(list4, _0x31b6be, _0x35bcab) {
    let _0x562c11 = false;
    let length = list4.length;
    for (let i2 = 0, _0xea5051 = length - 1; i2 < length; _0xea5051 = i2++) {
      let _0x3205eb = list4[i2][0];
      let _0x194c24 = list4[i2][1];
      let _0xdffee9 = list4[_0xea5051][0];
      let _0x7ab471 = list4[_0xea5051][1];
      if (callback30(_0x31b6be, _0x35bcab, _0x3205eb, _0x194c24, _0xdffee9, _0x7ab471)) {
        return 1;
      }
      var _0x5ac99c = _0x194c24 > _0x35bcab != _0x7ab471 > _0x35bcab && _0x31b6be < (_0xdffee9 - _0x3205eb) * (_0x35bcab - _0x194c24) / (_0x7ab471 - _0x194c24) + _0x3205eb;
      if (_0x5ac99c) {
        _0x562c11 = !_0x562c11;
      }
    }
    if (_0x562c11) {
      return 2;
    } else {
      return 0;
    }
  }
  function callback30(_0xddb793, _0x5909a8, _0x546daf, _0x21e81c, _0x3d49bc, _0x3776c9) {
    let _0x539722 = _0x546daf - _0xddb793;
    let _0x4520c5 = _0x21e81c - _0x5909a8;
    let _0xbbd220 = _0x3d49bc - _0xddb793;
    let _0x59c1e4 = _0x3776c9 - _0x5909a8;
    let _0x3d83e6 = _0x539722 * _0x59c1e4 - _0x4520c5 * _0xbbd220;
    let _0x10959f = _0x539722 * _0xbbd220 + _0x4520c5 * _0x59c1e4;
    return _0x3d83e6 == 0 && _0x10959f <= 0;
  }
  let _0x5e2101 = 1;
  const callback31 = () => _0x5e2101++;
  class Segment {
    constructor(_0x54e05d, _0x117225) {
      this.vector = undefined;
      this.a = undefined;
      this.b = undefined;
      this.c = undefined;
      if (_0x54e05d.equal(_0x117225)) ;
      this.mark = 0;
      this.shape = null;
      this.start = _0x54e05d;
      this.end = _0x117225;
      this.calc();
    }
    get owner() {
      return null;
    }
    calc() {
      const {
        start,
        end
      } = this;
      this.vector = end.clone().sub(start);
      let _0x7a555a = start.y - end.y;
      let _0x4cbc86 = end.x - start.x;
      const _0x48edee = Math.sqrt(_0x7a555a * _0x7a555a + _0x4cbc86 * _0x4cbc86);
      _0x7a555a /= _0x48edee;
      _0x4cbc86 /= _0x48edee;
      this.a = _0x7a555a;
      this.b = _0x4cbc86;
      this.c = -(_0x7a555a * start.x + _0x4cbc86 * start.y);
    }
    clone() {
      return new Segment(this.start, this.end);
    }
    reverse() {
      const start = this.start;
      this.start = this.end;
      this.end = start;
      this.calc();
      return this;
    }
    commit(_0x5c2d73) {
      this.shape = _0x5c2d73;
      this.start.commit(this);
      this.end.commit(this);
      return this;
    }
    remove() {
      this.shape = null;
      this.start.remove(this);
      this.end.remove(this);
    }
    length() {
      return this.vector.magnitude();
    }
    zn(segment) {
      const a2 = segment.a;
      const b2 = segment.b;
      const {
        a,
        b
      } = this;
      return callback26(a2, b2, a, b);
    }
    intersect(segment) {
      const a2 = segment.a;
      const b2 = segment.b;
      const c2 = segment.c;
      const start2 = segment.start;
      const end2 = segment.end;
      const {
        a,
        b,
        c,
        start,
        end
      } = this;
      const _0x45a39a = callback26(a2, b2, a, b);
      if (!callback21(_0x45a39a)) {
        const _0x204622 = -callback26(c2, b2, c, b) / _0x45a39a;
        const _0x47639a = -callback26(a2, c2, a, c) / _0x45a39a;
        const _0x2a78ce = callback27(start2.x, end2.x, _0x204622) && callback27(start2.y, end2.y, _0x47639a) && callback27(start.x, end.x, _0x204622) && callback27(start.y, end.y, _0x47639a) && new Vector(_0x204622, _0x47639a);
        if (!_0x2a78ce) {
          return null;
        }
        return {
          point: start.equal(_0x2a78ce) && start || end.equal(_0x2a78ce) && end || start2.equal(_0x2a78ce) && start2 || end2.equal(_0x2a78ce) && end2 || _0x2a78ce,
          segment: this,
          distance: _0x2a78ce.distance2(start2),
          overlay: false,
          zn: Math.sign(_0x45a39a)
        };
      }
      const _0x4d2c22 = callback28(start2.x, end2.x, start.x, end.x);
      const _0x599176 = callback28(start2.y, end2.y, start.y, end.y);
      if (callback21(callback26(a2, c2, a, c)) && callback21(callback26(b2, c2, b, c)) && _0x4d2c22 >= -_0x68ae04 && _0x599176 >= -_0x68ae04) {
        if (_0x4d2c22 >= _0x68ae04 || _0x599176 >= _0x68ae04) {
          let _0x357b15;
          if (callback27(start.x, end.x, start2.x) && callback27(start.y, end.y, start2.y)) {
            _0x357b15 = start.equal(start2) && start || end.equal(start2) && end || start2;
          } else {
            _0x357b15 = start2.distance2(start) >= start2.distance2(end) ? end : start;
          }
          return {
            point: _0x357b15,
            segment: this,
            distance: _0x357b15.distance2(start2),
            overlay: true,
            zn: 0
          };
        }
        const _0x447570 = start.equal(start2) || start.equal(end2) ? start : end;
        return {
          point: _0x447570,
          segment: this,
          distance: _0x447570.distance2(start2),
          overlay: false,
          zn: 0
        };
      }
      return null;
    }
    has(_0x1924dc) {
      return this.start === _0x1924dc || this.end === _0x1924dc;
    }
  }
  const _0x49b883 = 1;
  class ContourPoints {
    constructor(_0xc98fbf, _0x89e3d1) {
      this.points = [];
      this.x = _0xc98fbf;
      this.y = _0x89e3d1;
    }
    commit(_0x2450aa) {
      this.points.push(_0x2450aa);
      _0x2450aa.cell = this;
    }
    remove(_0x113f3c) {
      const {
        points
      } = this;
      const _0x5b2879 = points.indexOf(_0x113f3c);
      if (_0x5b2879 !== -1) {
        points.splice(_0x5b2879, 1);
        _0x113f3c.cell = null;
      }
    }
  }
  class SpatialGrid {
    constructor(_0x340a9c, _0x15a11b, _0x369cbe) {
      this.width = _0x340a9c;
      this.height = _0x15a11b;
      this.center = new Vector(_0x340a9c / 2, _0x15a11b / 2);
      this.size = _0x369cbe;
      this.w = Math.ceil(_0x340a9c / _0x369cbe);
      this.h = Math.ceil(_0x15a11b / _0x369cbe);
      this.cells = [];
      for (let i2 = 0; i2 < this.h; i2++) {
        for (let i3 = 0; i3 < this.w; i3++) {
          this.cells.push(new ContourPoints(i3, i2));
        }
      }
      Vector.space = this;
    }
    count() {
      let _0x1b83e4 = 0;
      this.cells.forEach(_0x335c43 => {
        _0x1b83e4 += _0x335c43.points.length;
      });
      return _0x1b83e4;
    }
    cell(point) {
      return this.getCell(Math.floor(point.x / this.size) % this.w, Math.floor(point.y / this.size) % this.h);
    }
    getCell(_0x2c5062, _0x2cc9d6) {
      let _0x3725fd = this.cells[_0x2c5062 + _0x2cc9d6 * this.w];
      if (!_0x3725fd) {}
      return _0x3725fd;
    }
    checkPoint(_0x2b141d) {
      const _0x5e04d1 = this.cell(_0x2b141d);
      return _0x5e04d1.points.find(_0x5066b3 => _0x5066b3.equal(_0x2b141d)) || _0x2b141d;
    }
    segmentsCount() {
      const _0x343c03 = {};
      for (let i2 = 0; i2 < this.h; i2++) {
        for (let i3 = 0; i3 < this.w; i3++) {
          this.getCell(i3, i2).points.forEach(_0xeb68e9 => {
            _0xeb68e9.segments.forEach(_0x27b7e0 => _0x343c03[_0x27b7e0.id] = _0x27b7e0);
          });
        }
      }
      return _0x343c03;
    }
    intersections(segment) {
      const point = this.cell(segment.start);
      const point2 = this.cell(segment.end);
      const _0x25009c = Math.max(0, Math.min(point.x, point2.x) - _0x49b883);
      const _0x3daed4 = Math.min(this.w - 1, Math.max(point.x, point2.x) + _0x49b883);
      const _0x511ed8 = Math.max(0, Math.min(point.y, point2.y) - _0x49b883);
      const _0x149c88 = Math.min(this.h - 1, Math.max(point.y, point2.y) + _0x49b883);
      const _0x4cb258 = callback31();
      const list4 = [];
      for (let _0x5e0248 = _0x511ed8; _0x5e0248 <= _0x149c88; _0x5e0248++) {
        for (let _0x1d1ea0 = _0x25009c; _0x1d1ea0 <= _0x3daed4; _0x1d1ea0++) {
          this.getCell(_0x1d1ea0, _0x5e0248).points.forEach(_0x59cdb7 => {
            _0x59cdb7.segments.forEach(segment2 => {
              if (segment2.mark !== _0x4cb258) {
                const _0x302e7a = segment2.intersect(segment);
                if (_0x302e7a) {
                  list4.push(_0x302e7a);
                }
                segment2.mark = _0x4cb258;
              }
            });
          });
        }
      }
      return list4;
    }
    clear() {
      this.cells = [];
    }
  }
  const _0x159f84 = 30000;
  const _0x112dd5 = Array.from({
    length: _0x159f84
  });
  let i = 0;
  class Vector {
    constructor(_0x333689, _0x2c2873) {
      this.x = undefined;
      this.y = undefined;
      this.cell = null;
      this.segments = [];
      this.set(_0x333689, _0x2c2873);
    }
    set(_0x24ed4b, _0x4cbd32) {
      this.x = _0x24ed4b || 0;
      this.y = _0x4cbd32 || (_0x4cbd32 === 0 ? 0 : this.x);
      return this;
    }
    commit(_0x49b35c) {
      if (this.segments.indexOf(_0x49b35c) === -1) {
        this.segments.push(_0x49b35c);
      }
      if (!this.cell) {
        const _0x19525f = Vector.space.cell(this);
        _0x19525f.commit(this);
      }
    }
    remove(_0x5b5121) {
      const _0x34a58e = this.segments.indexOf(_0x5b5121);
      this.segments.splice(_0x34a58e, 1);
      if (this.cell && !this.segments.length) {
        this.cell.remove(this);
      }
    }
    release() {
      Vector.release(this);
    }
    add(point) {
      this.x += point.x;
      this.y += point.y;
      return this;
    }
    sub(point) {
      this.x -= point.x;
      this.y -= point.y;
      return this;
    }
    mul(point) {
      this.x *= point.x;
      this.y *= point.y;
      return this;
    }
    mulScalar(_0x4bb0bb) {
      this.x *= _0x4bb0bb;
      this.y *= _0x4bb0bb;
      return this;
    }
    magnitude() {
      const {
        x,
        y
      } = this;
      return Math.sqrt(x * x + y * y);
    }
    normalize() {
      const _0x4b7ce1 = this.magnitude();
      if (_0x4b7ce1) {
        this.mulScalar(1 / _0x4b7ce1);
      }
      return this;
    }
    copy(point) {
      this.x = point.x;
      this.y = point.y;
      return this;
    }
    distance(_0x1dace5) {
      return Math.sqrt(this.distance2(_0x1dace5));
    }
    distance2(point) {
      const _0x599dbc = this.x - point.x;
      const _0x30891c = this.y - point.y;
      return _0x599dbc * _0x599dbc + _0x30891c * _0x30891c;
    }
    cross(point) {
      return this.x * point.y - this.y * point.x;
    }
    dot(point) {
      return this.x * point.x + this.y * point.y;
    }
    rotate(_0x55cbe9) {
      const {
        x,
        y
      } = this;
      const _0x32b915 = Math.cos(_0x55cbe9);
      const _0x3daad6 = Math.sin(_0x55cbe9);
      this.x = x * _0x32b915 - y * _0x3daad6;
      this.y = x * _0x3daad6 + y * _0x32b915;
      return this;
    }
    angle(_0x23b00d) {
      return Math.atan2(this.cross(_0x23b00d), this.dot(_0x23b00d));
    }
    invert() {
      return this.mulScalar(-1);
    }
    equal(point) {
      return callback22(this.x, point.x) && callback22(this.y, point.y);
    }
    clone() {
      return new Vector(this.x, this.y);
    }
    static alloc(_0x4aaf81, _0x4b47ee) {
      if (i) {
        let _0x49e91f = _0x112dd5[--i].set(_0x4aaf81, _0x4b47ee);
        return _0x49e91f;
      }
      return new Vector(_0x4aaf81, _0x4b47ee);
    }
    static clone(point) {
      return Vector.alloc(point.x, point.y);
    }
    static poolLength() {
      return i;
    }
    toString() {
      return "[" + this.x.toFixed(4) + "," + this.y.toFixed(4) + "]";
    }
    static release(vector) {
      if (i < _0x159f84) {
        vector.set();
        if (vector.cell || vector.segments.length) {}
        _0x112dd5[i++] = vector;
      }
    }
  }
  Vector.space = undefined;
  const _0x3e57df = 25;
  const _0x2069c7 = _0x3e57df * _0x3e57df;
  const _0x1f3950 = 0;
  const _0x1466e3 = 1;
  const _0x46f91a = 2;
  const _0xdf8741 = 3;
  const _0x52fd24 = 4;
  const _0x17fe5b = 5;
  const _0x21e037 = 6;
  const _0x3bad23 = 7;
  const _0x4eb235 = 1000 / 60;
  const _0xbeedd5 = 1000 / 60 * 2;
  class Polyline {
    constructor(_0x3d26c8) {
      this.owner = _0x3d26c8 || null;
      this.start = null;
      this.end = null;
      this.segments = [];
      this.bounds = {
        left: Infinity,
        right: -Infinity,
        top: Infinity,
        bottom: -Infinity
      };
      this.path = new Path2D();
    }
    commit(_0x3f07dd) {
      this.segments.forEach(_0x58a112 => _0x58a112.commit(_0x3f07dd));
    }
    remove() {
      this.segments.forEach(_0x110556 => _0x110556.remove());
    }
    reverse() {
      this.segments.reverse().forEach(_0x2603ff => _0x2603ff.reverse());
      if (this.end) {
        [this.start, this.end] = [this.end, this.start];
      }
      return this;
    }
    clone() {
      const polyline = new Polyline();
      polyline.segments = this.segments.map(_0x24ec13 => _0x24ec13.clone());
      polyline.start = this.start;
      polyline.end = this.end;
      Object.assign(polyline.bounds, this.bounds);
      return polyline;
    }
    updateBounds(_0x1f0631) {
      const {
        x,
        y
      } = _0x1f0631;
      this.bounds.left = Math.min(this.bounds.left, x);
      this.bounds.right = Math.max(this.bounds.right, x);
      this.bounds.top = Math.min(this.bounds.top, y);
      this.bounds.bottom = Math.max(this.bounds.bottom, y);
    }
    add2(_0x45500e) {
      const _0x2b66d7 = this.end || this.start;
      if (_0x2b66d7 && _0x2b66d7.equal(_0x45500e)) {
        return false;
      }
      const {
        x,
        y
      } = _0x45500e;
      if (this.end) {
        this.segments.push(new Segment(this.end, _0x45500e).commit(this));
        this.end = _0x45500e;
        this.updateBounds(_0x45500e);
        this.path.lineTo(x, y);
        return true;
      }
      if (this.start) {
        this.segments.push(new Segment(this.start, _0x45500e).commit(this));
        this.end = _0x45500e;
        this.updateBounds(_0x45500e);
        this.path.lineTo(x, y);
        return true;
      }
      this.start = _0x45500e;
      this.updateBounds(_0x45500e);
      this.path.moveTo(x, y);
      return true;
    }
    points() {
      const list4 = this.segments.map(_0x16d5ec => _0x16d5ec.start);
      if (this.end) {
        list4.push(this.end);
      }
      return list4;
    }
    toString() {
      return this.segments.map(_0x2d5a82 => _0x2d5a82.start.toString()).join("");
    }
  }
  const callback32 = (point, point2, point3) => {
    const _0x359fb7 = point.x - point3.x;
    const _0x427823 = point.y - point3.y;
    const _0x2d8056 = point2.x - point3.x;
    const _0xbe51ea = point2.y - point3.y;
    if (_0x427823 * _0xbe51ea > 0) {
      return 1;
    }
    const _0x1d9cb5 = _0x359fb7 * _0xbe51ea - _0x427823 * _0x2d8056;
    const _0x2d8392 = callback21(_0x1d9cb5) ? 0 : Math.sign(_0x1d9cb5);
    if (_0x2d8392 === 0) {
      if (_0x359fb7 * _0x2d8056 <= 0) {
        return 0;
      }
      return 1;
    }
    if (_0x427823 < 0) {
      return -_0x2d8392;
    }
    if (_0xbe51ea < 0) {
      return _0x2d8392;
    }
    return 1;
  };
  class Polygon {
    constructor(_0x255831) {
      this.segments = [];
      this.simplify = [];
      this.owner = null;
      this.bounds = null;
      const {
        length
      } = _0x255831;
      for (let i2 = 0; i2 < length;) {
        this.segments.push(new Segment(_0x255831[i2++], _0x255831[i2 < length ? i2 : 0]));
      }
      this.updateBounds();
    }
    commit(_0x3a2c90) {
      if (_0x3a2c90) {
        this.owner = _0x3a2c90;
      }
      this.segments.forEach(_0x4636cc => _0x4636cc.commit(this));
    }
    remove() {
      this.segments.forEach(_0x37e88a => _0x37e88a.remove());
    }
    reverse() {
      this.segments.reverse();
      this.segments.forEach(_0x3c3a50 => _0x3c3a50.reverse());
      return this;
    }
    insert(segment, _0xfd2d76) {
      if (!segment.has(_0xfd2d76)) {
        const _0x4460e0 = this.segments.findIndex(_0x468389 => _0x468389 === segment);
        const _0x55e498 = new Segment(segment.start, _0xfd2d76).commit(this);
        const _0x121664 = new Segment(_0xfd2d76, segment.end).commit(this);
        segment.remove();
        this.segments.splice(_0x4460e0, 1, _0x55e498, _0x121664);
      }
    }
    hasPoint(_0x451bf0) {
      return this.segments.some(_0x562047 => _0x562047.has(_0x451bf0));
    }
    findSegment(_0x596d0c) {
      const _0x892d49 = this.segments.findIndex(_0xf1b1f2 => _0xf1b1f2.start === _0x596d0c);
      return _0x892d49;
    }
    splice(_0x4ff73a, _0x2e9f8f, _0x198893) {
      const list4 = this.segments.splice(_0x2e9f8f, _0x198893 - _0x2e9f8f, ..._0x4ff73a.segments);
      list4.forEach(_0x2e3d66 => _0x2e3d66.remove());
      _0x4ff73a.commit(this);
    }
    unsplice(_0x310c71, _0x35431a, _0x11653f) {
      const _0x10df9f = this.segments.splice(_0x35431a, _0x11653f - _0x35431a);
      this.remove();
      this.segments = _0x10df9f.concat(_0x310c71.reverse().segments);
      _0x310c71.commit(this);
    }
    left(list4, _0x2a2bca, _0x48f39f) {
      const list5 = [];
      for (let i2 = 0; i2 < list4.length - 1; i2++) {
        list5.push(new Segment(list4[i2], list4[i2 + 1]));
      }
      const list6 = this.segments.splice(_0x2a2bca, _0x48f39f - _0x2a2bca, ...list5);
      list5.forEach(_0x35a035 => _0x35a035.commit(this));
      list6.forEach(_0x2b5a2a => _0x2b5a2a.remove());
    }
    right(list4, _0x4ab91c, _0x458307) {
      const list5 = [];
      for (let i2 = 0; i2 < list4.length - 1; i2++) {
        list5.push(new Segment(list4[i2], list4[i2 + 1]));
      }
      const _0x2f1ab5 = this.segments.splice(_0x4ab91c, _0x458307 - _0x4ab91c);
      this.remove();
      list5.reverse().forEach(_0x103f4f => _0x103f4f.reverse().commit(this));
      this.segments = _0x2f1ab5.concat(list5);
    }
    points() {
      return this.segments.map(_0x38c25d => _0x38c25d.start);
    }
    intersections(_0x5d6a44) {
      let list4 = [];
      if (this.segments.length > 1) {
        this.segments.forEach(_0x2a1d8e => {
          const _0x3c561e = _0x2a1d8e.intersect(_0x5d6a44);
          if (_0x3c561e) {
            list4.push(_0x3c561e);
          }
        });
      }
      if (list4.length > 1) {
        list4.sort((_0x322e6b, _0x297678) => _0x322e6b.distance - _0x297678.distance);
        list4 = list4.filter(function (_0x891589, _0x3eacac) {
          return list4.findIndex(_0x423edb => _0x423edb.point === _0x891589.point) == _0x3eacac;
        });
      }
      return list4;
    }
    inside(_0x1c5c04) {
      const {
        length
      } = this.segments;
      let _0x50b175 = 1;
      for (let i2 = 0; i2 < length; i2++) {
        const {
          start,
          end
        } = this.segments[i2];
        const _0x4985c4 = callback32(start, end, _0x1c5c04);
        if (_0x4985c4 === 0) {
          return true;
        }
        _0x50b175 *= _0x4985c4;
      }
      return _0x50b175 !== 1;
    }
    insideNew(point) {
      return !!callback29(this.segments.map(_0x5e990e => [_0x5e990e.start.x, _0x5e990e.start.y]), point.x, point.y);
    }
    rawSquare() {
      let _0x3e0443 = 0;
      this.segments.forEach(_0x3e7aee => {
        const {
          start,
          end
        } = _0x3e7aee;
        _0x3e0443 += (start.x + end.x) * (end.y - start.y);
      });
      return _0x3e0443 / 2;
    }
    square() {
      let _0xa51275 = this.rawSquare();
      if (_0xa51275 < 0) {
        {
          _0xa51275 *= -1;
        }
      }
      return _0xa51275;
    }
    calcPath() {
      const path2D = new Path2D();
      const {
        segments
      } = this;
      const {
        length
      } = segments;
      const {
        start
      } = segments[0];
      path2D.moveTo(start.x, start.y);
      for (let _0x521bb1 = 1; _0x521bb1 < length; _0x521bb1++) {
        const {
          start: point
        } = segments[_0x521bb1];
        path2D.lineTo(point.x, point.y);
      }
      path2D.closePath();
      this.path = path2D;
      this.updateBounds();
    }
    calcSimplify() {
      this.simplify = [];
      let i2 = 0;
      this.segments.forEach(_0x43c7c4 => {
        const {
          start
        } = _0x43c7c4;
        if (i2 < 2) {
          this.simplify.push(start);
          i2++;
        } else {
          const _0x5df51c = this.simplify[i2 - 2];
          if (start.distance2(_0x5df51c) < _0x2069c7) {
            this.simplify[i2 - 1] = start;
          } else {
            this.simplify.push(start);
            i2++;
          }
        }
      });
    }
    updateBounds() {
      this.calcSimplify();
      let _0x303bc7 = Infinity;
      let _0x4fff1c = -Infinity;
      let _0x225d78 = Infinity;
      let _0x4bf61d = -Infinity;
      this.simplify.forEach(_0x2a224d => {
        const {
          x,
          y
        } = _0x2a224d;
        _0x303bc7 = Math.min(_0x303bc7, x);
        _0x4fff1c = Math.max(_0x4fff1c, x);
        _0x225d78 = Math.min(_0x225d78, y);
        _0x4bf61d = Math.max(_0x4bf61d, y);
      });
      _0x303bc7 -= _0x3e57df;
      _0x4fff1c += _0x3e57df;
      _0x225d78 -= _0x3e57df;
      _0x4bf61d += _0x3e57df;
      this.bounds = {
        left: _0x303bc7,
        right: _0x4fff1c,
        top: _0x225d78,
        bottom: _0x4bf61d
      };
    }
  }
  const _0x98c0a2 = typeof performance !== "undefined" ? performance : Date;
  const now = _0x98c0a2.now.bind(_0x98c0a2);
  const callback33 = (point, _0x48b647, _0x58ad92) => {
    if (typeof point.x !== "number") {
      throw Error("circle");
    }
    const _0x25a8fb = Math.PI * 2;
    const _0x2d7adf = _0x25a8fb / _0x48b647;
    const list4 = [];
    for (let _0x2c4aaf = 0; _0x2c4aaf < _0x25a8fb - _0x68ae04; _0x2c4aaf += _0x2d7adf) {
      list4.push(new Vector(point.x + Math.cos(_0x2c4aaf) * _0x58ad92, point.y + Math.sin(_0x2c4aaf) * _0x58ad92));
    }
    return list4;
  };
  const callback34 = _0x13fdc1 => {
    const _0xb42ed3 = parseInt(_0x13fdc1.substring(1, 3), 16);
    const _0x4c451e = parseInt(_0x13fdc1.substring(3, 5), 16);
    const _0x900965 = parseInt(_0x13fdc1.substring(5, 7), 16);
    return {
      r: _0xb42ed3,
      g: _0x4c451e,
      b: _0x900965
    };
  };
  const callback35 = ({
    r,
    g,
    b
  }) => {
    let _0x41c2d1;
    let _0x3e79c6;
    let _0x1e228e;
    let _0x5d8573;
    let _0x1dd657;
    let _0xa339c4;
    let _0x2b6087;
    let _0x51507f;
    let _0x42049b;
    let _0x1c52d9;
    let callback95;
    let callback96;
    _0x41c2d1 = r / 255;
    _0x3e79c6 = g / 255;
    _0x1e228e = b / 255;
    _0x42049b = Math.max(_0x41c2d1, _0x3e79c6, _0x1e228e);
    _0x1c52d9 = _0x42049b - Math.min(_0x41c2d1, _0x3e79c6, _0x1e228e);
    callback95 = _0x1e65f9 => (_0x42049b - _0x1e65f9) / 6 / _0x1c52d9 + 1 / 2;
    callback96 = _0x2ed2f4 => Math.round(_0x2ed2f4 * 100) / 100;
    if (_0x1c52d9 == 0) {
      _0x2b6087 = _0x51507f = 0;
    } else {
      _0x51507f = _0x1c52d9 / _0x42049b;
      _0x5d8573 = callback95(_0x41c2d1);
      _0x1dd657 = callback95(_0x3e79c6);
      _0xa339c4 = callback95(_0x1e228e);
      if (_0x41c2d1 === _0x42049b) {
        _0x2b6087 = _0xa339c4 - _0x1dd657;
      } else if (_0x3e79c6 === _0x42049b) {
        _0x2b6087 = 1 / 3 + _0x5d8573 - _0xa339c4;
      } else if (_0x1e228e === _0x42049b) {
        _0x2b6087 = 2 / 3 + _0x1dd657 - _0x5d8573;
      }
      if (_0x2b6087 < 0) {
        _0x2b6087 += 1;
      } else if (_0x2b6087 > 1) {
        _0x2b6087 -= 1;
      }
    }
    return {
      h: Math.round(_0x2b6087 * 360),
      s: callback96(_0x51507f * 100),
      v: callback96(_0x42049b * 100)
    };
  };
  const callback36 = ({
    r,
    g,
    b
  }) => {
    const callback95 = _0x42cf50 => {
      const _0xb78e78 = _0x42cf50.toString(16);
      if (_0xb78e78.length < 2) {
        return "0" + _0xb78e78;
      } else {
        return _0xb78e78;
      }
    };
    return "#" + callback95(r) + callback95(g) + callback95(b);
  };
  const callback37 = ({
    h,
    s,
    v
  }) => {
    var _0x18605b;
    var _0x1af8eb;
    var _0xd7fdbe;
    var _0x3ece4f;
    var _0xb9da1b;
    var _0x4d9923;
    var _0x42369d;
    var _0x5970af;
    h = Math.max(0, Math.min(360, h));
    s = Math.max(0, Math.min(100, s));
    v = Math.max(0, Math.min(100, v));
    s /= 100;
    v /= 100;
    if (s == 0) {
      _0x18605b = _0x1af8eb = _0xd7fdbe = v;
      return {
        r: Math.round(_0x18605b * 255),
        g: Math.round(_0x1af8eb * 255),
        b: Math.round(_0xd7fdbe * 255)
      };
    }
    h /= 60;
    _0x3ece4f = Math.floor(h);
    _0xb9da1b = h - _0x3ece4f;
    _0x4d9923 = v * (1 - s);
    _0x42369d = v * (1 - s * _0xb9da1b);
    _0x5970af = v * (1 - s * (1 - _0xb9da1b));
    switch (_0x3ece4f) {
      case 0:
        _0x18605b = v;
        _0x1af8eb = _0x5970af;
        _0xd7fdbe = _0x4d9923;
        break;
      case 1:
        _0x18605b = _0x42369d;
        _0x1af8eb = v;
        _0xd7fdbe = _0x4d9923;
        break;
      case 2:
        _0x18605b = _0x4d9923;
        _0x1af8eb = v;
        _0xd7fdbe = _0x5970af;
        break;
      case 3:
        _0x18605b = _0x4d9923;
        _0x1af8eb = _0x42369d;
        _0xd7fdbe = v;
        break;
      case 4:
        _0x18605b = _0x5970af;
        _0x1af8eb = _0x4d9923;
        _0xd7fdbe = v;
        break;
      default:
        _0x18605b = v;
        _0x1af8eb = _0x4d9923;
        _0xd7fdbe = _0x42369d;
    }
    return {
      r: Math.round(_0x18605b * 255),
      g: Math.round(_0x1af8eb * 255),
      b: Math.round(_0xd7fdbe * 255)
    };
  };
  const callback38 = _0x8d0fc2 => callback36(callback37(_0x8d0fc2));
  function callback39(_0x3d2196) {
    if (_0x3d2196 > 0 && _0x3d2196 < 1) {
      _0x3d2196 = Math.floor(_0x3d2196 * 1000000000);
    }
    let callback95 = _0x51efea => {
      _0x3d2196 = (_0x3d2196 * 69069 + 1) % 2147483648;
      return _0x3d2196 % _0x51efea;
    };
    let _0x564c00 = _0x1dfc31 => _0x1dfc31 == null ? callback95(1000000000) / 1000000000 : callback95(_0x1dfc31);
    return _0x564c00;
  }
  function callback40(_0x52140a) {
    return new Promise(callback95 => {
      let element = document.createElement("img");
      element.src = _0x52140a;
      element.onload = function () {
        callback95(element);
      };
    });
  }
  function callback41(_0x25a581, _0x474ff8) {
    let {
      h,
      s,
      v
    } = _0x25a581;
    v *= _0x474ff8;
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function callback42(_0xf88f07, _0x5301b4) {
    let {
      h,
      s,
      v
    } = _0xf88f07;
    const _0x7e5e36 = 100 - v;
    v = Math.max(v * _0x5301b4, v + _0x5301b4 * _0x7e5e36 / 4);
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function callback43(_0x4e37c0, _0x5b933a) {
    let {
      h,
      s,
      v
    } = _0x4e37c0;
    v = _0x5b933a;
    return {
      h: h,
      s: s,
      v: v
    };
  }
  function callback44(_0x2134de) {
    return _0x2134de.toFixed(2);
  }
  class Border {
    constructor(_0x47fbad, _0x1797db, _0x11ec0c) {
      if (!(_0x47fbad instanceof Polygon)) {}
      this.polygon = _0x47fbad;
      this.radius = _0x11ec0c;
      this.center = _0x1797db;
    }
    static circular(_0x2a3b43, _0x453954, _0x3949f1) {
      return new Border(new Polygon(callback33(_0x2a3b43, _0x453954, _0x3949f1)), _0x2a3b43, _0x3949f1);
    }
    intersections(segment) {
      {
        if (segment.start.distance2(this.center) < this.radius ** 2 * 0.95 && segment.end.distance2(this.center) < this.radius ** 2 * 0.95) {
          return [];
        }
      }
      return this.polygon.intersections(segment).filter(_0x15d63f => !_0x15d63f.overlay);
    }
  }
  class Territory {
    constructor(_0x5b9270, _0x3ab68b) {
      this.unit = undefined;
      this.isTrack = undefined;
      this.unit = _0x5b9270;
      this.merges = [];
      this.polygon = new Polygon(_0x3ab68b);
      this.polygon.commit(this);
      this.calcSquare();
      this.polygon.calcPath();
    }
    calcPath() {
      this.path = new Path2D();
      const {
        segments
      } = this.polygon;
      const {
        length
      } = segments;
      const {
        start
      } = segments[0];
      this.path.moveTo(start.x, start.y);
      for (let _0xa27888 = 1; _0xa27888 < length; _0xa27888++) {
        const {
          start: point
        } = segments[_0xa27888];
        this.path.lineTo(point.x, point.y);
      }
      this.path.closePath();
      return this.path;
    }
    calcSquare() {
      this.square = this.polygon.square();
    }
    remove() {
      this.polygon.remove();
    }
    handleIntersect(_0x17a22b, _0x7347fa, _0x3a81c5) {
      if (_0x7347fa === this.unit) {
        this.handleSelfIntersect(_0x17a22b, _0x7347fa, _0x3a81c5);
      } else {
        this.handleEnemyIntersect(_0x17a22b, _0x7347fa, _0x3a81c5);
      }
    }
    handleSelfIntersect(_0x445601, unit, segment) {
      if (_0x445601.overlay) {
        return;
      }
      this.unit.onScoreChanged();
      const {
        point: _0x38ac8f,
        segment: _0xc0765
      } = _0x445601;
      if (unit.in === this) {
        if (_0x445601.zn < 0) {
          return;
        }
        if (_0x38ac8f.equal(segment.end)) {
          return;
        }
        this.polygon.insert(_0xc0765, _0x38ac8f);
        unit.track.add(_0x38ac8f);
        unit.in = null;
        if (unit.schemes) {
          unit.schemes.out();
        }
        if (unit.achievements) {
          unit.achievements.onOut();
        }
      } else {
        if (_0x445601.zn > 0) {
          return;
        }
        if (_0x38ac8f.equal(segment.start)) {
          return;
        }
        if (unit.in) {
          return;
        }
        this.polygon.insert(_0xc0765, _0x38ac8f);
        unit.track.add(_0x38ac8f);
        if (unit.track.polyline.end) {
          this.unit.game.handleReturn(unit);
        }
        unit.in = this;
        unit.track.remove();
      }
    }
    handleEnemyIntersect(_0x1cb2ac, unit, _0x14e0ee) {
      const {
        point: _0x59ff3e,
        segment: _0x323756
      } = _0x1cb2ac;
      if (unit.in === this) {
        if (_0x1cb2ac.zn < 0) {
          return;
        }
        this.polygon.insert(_0x323756, _0x59ff3e);
        unit.track.add(_0x59ff3e);
        unit.track.intersect(_0x1cb2ac, this, false);
        unit.in = null;
      } else {
        if (_0x1cb2ac.zn > 0) {
          return;
        }
        if (_0x1cb2ac.overlay) {
          return;
        }
        if (_0x59ff3e.equal(_0x14e0ee.end)) {
          return;
        }
        if (unit.in) {
          return;
        }
        this.polygon.insert(_0x323756, _0x59ff3e);
        unit.track.add(_0x59ff3e);
        unit.track.intersect(_0x1cb2ac, this, true);
        unit.in = this;
      }
    }
  }
  class Trail {
    constructor(_0x245895) {
      this.polyline = new Polyline(this);
      this.simplyline = [];
      this.unit = _0x245895;
      this.length = 0;
      this.intersections = [];
      this.isTrack = true;
    }
    add(_0xafeb98) {
      if (this.polyline.add2(_0xafeb98)) {
        const length2 = this.polyline.segments.length;
        if (length2 > 0) {
          const segment = this.polyline.segments[length2 - 1];
          this.length += segment.start.distance(segment.end);
        }
        const {
          simplyline
        } = this;
        const {
          length
        } = simplyline;
        if (length > 2) {
          const _0x57e4cc = simplyline[length - 2];
          if (_0xafeb98.distance2(_0x57e4cc) < _0x2069c7) {
            simplyline[length - 1] = _0xafeb98;
          } else {
            simplyline.push(_0xafeb98);
          }
        } else {
          simplyline.push(_0xafeb98);
        }
      }
    }
    intersect(_0x19b8cd, _0x3142da, _0x463f2a) {
      const _0x10c5e0 = this.intersections.find(_0x36bb8e => _0x36bb8e.point.equal(_0x19b8cd.point));
      if (_0x10c5e0) {
        _0x10c5e0.intersections.push({
          intersection: _0x19b8cd,
          base: _0x3142da,
          enter: _0x463f2a
        });
      } else {
        this.intersections.push({
          point: _0x19b8cd.point,
          intersections: [{
            intersection: _0x19b8cd,
            base: _0x3142da,
            enter: _0x463f2a
          }]
        });
      }
    }
    remove() {
      this.polyline.remove();
      this.polyline = new Polyline(this);
      this.length = 0;
      this.simplyline = [];
      this.intersections = [];
    }
    handleIntersect(_0x1d2561, unit, _0x413bce) {
      let game = unit.game;
      if (unit === this.unit) {
        if (_0x1d2561.overlay === true || _0x1d2561.point !== this.polyline.segments[this.polyline.segments.length - 1].end) {
          this.unit.position = _0x1d2561.point;
          const _0x75cb21 = game.border.radius - unit.position.distance(game.space.center) < 5 ? _0x46f91a : _0x1466e3;
          game.kill(this.unit, undefined, _0x75cb21);
        }
      } else {
        game.kill(this.unit, unit, _0xdf8741);
      }
    }
  }
  class StateMachine {
    constructor(_0xd415fd, _0x36b757, _0x208008) {
      this.states = _0xd415fd;
      this.state = "";
      this.payload = _0x208008;
      this.context = {};
      this.change(_0x36b757);
    }
    change(_0x4a1b80) {
      const _0x238b4d = this.states[this.state];
      if (_0x238b4d && _0x238b4d.leave) {
        this.context = _0x238b4d.leave(this.payload, this.context) || this.context;
      }
      const _0x2c8e0b = this.states[_0x4a1b80];
      if (_0x2c8e0b) {
        this.state = _0x4a1b80;
        this.context = _0x2c8e0b.enter && _0x2c8e0b.enter(this.payload, this.context) || this.context;
        this.update();
      }
    }
    update() {
      const _0x165fc7 = this.states[this.state];
      const _0x404183 = _0x165fc7 && _0x165fc7.update(this.payload, this.context);
      if (_0x404183) {
        this.change(_0x404183);
      }
    }
  }
  const callback45 = unit => {
    const {
      player
    } = unit.game;
    if (player) {
      const _0x4ac939 = Math.max(unit.vrange, player.vrange);
      const _0x4c70de = _0x4ac939 * unit.aggro * 0.75;
      const {
        simplyline
      } = player.track;
      for (let i2 = 0, length = simplyline.length; i2 < length; i2++) {
        if (unit.position.distance2(simplyline[i2]) < _0x4c70de * _0x4c70de) {
          return true;
        }
      }
    }
  };
  const callback46 = (unit, _0x44a2f5) => {
    if (unit.in === unit.base) {
      return false;
    }
    return unit.maxDanger > unit.def * 0.8;
  };
  var _0x3d8162 = {
    idle: {
      enter: function () {
        return {};
      },
      update: function (unit, _0xe0c32) {
        if (unit.in === unit.base) {
          if (unit.game.rng() < 0.25) {
            return "cut";
          } else {
            return "exit";
          }
        } else {
          return "back";
        }
      }
    },
    capital: {
      update: function (unit, _0x523554) {
        if (unit.in !== unit.base) {
          return "capture";
        }
        const _0x52c589 = unit.position.distance(unit.game.space.center);
        const _0x13ff07 = unit.game.border.radius - _0x52c589;
        unit.target = _0x523554.point;
      }
    },
    cut: {
      enter: function (unit) {
        const vector = unit.position.clone().sub(unit.game.space.center);
        const _0x4b04b0 = vector.magnitude();
        const segment = new Segment(unit.position, vector.normalize().mulScalar(unit.game.border.radius + 10).add(unit.game.space.center));
        const list4 = unit.base.polygon.intersections(segment);
        const _0x1ad216 = {};
        if (!list4.length) {
          console.log("bot.position", unit.position.x, unit.position.y);
          console.log("intersections", list4);
        }
        list4.sort((_0x1800ec, _0xfa7457) => _0x1800ec.distance - _0xfa7457.distance);
        _0x1ad216.exitPoint = list4[0] && list4[0].point;
        return _0x1ad216;
      },
      update: function (unit, _0x3bf6d4) {
        if (unit.in !== unit.base) {
          return "capture";
        }
        const _0x5636af = unit.position.distance(unit.game.space.center);
        const _0x4daa27 = unit.game.border.radius - _0x5636af;
        if (!_0x3bf6d4.exitPoint || _0x4daa27 < 1) {
          return "idle";
        }
        unit.target = _0x3bf6d4.exitPoint;
      }
    },
    exit: {
      enter: function (unit) {
        const _0x1e64c4 = {};
        let _0x778392 = Infinity;
        let _0x16aea8;
        const {
          length
        } = unit.base.polygon.segments;
        let unitSpeed = unit.game.config.unitSpeed;
        _0x1e64c4.minDistance = unitSpeed;
        while (_0x16aea8 === undefined) {
          for (let i2 = 0; i2 < 1; i2++) {
            const _0x6b2a20 = ~~(unit.game.rng() * length);
            const start = unit.base.polygon.segments[_0x6b2a20].start;
            const _0x4166ee = start.distance(unit.position);
            if (_0x4166ee < _0x778392 && _0x4166ee > unitSpeed) {
              _0x778392 = _0x4166ee;
              _0x16aea8 = _0x6b2a20;
            }
          }
          unitSpeed *= 0.75;
        }
        _0x1e64c4.exitPoint = unit.base.polygon.segments[_0x16aea8].start;
        return _0x1e64c4;
      },
      update: function (unit, _0x22e93a) {
        if (unit.in !== unit.base) {
          _0x22e93a = {};
          return "capture";
        }
        if (callback45(unit)) {
          return "attack";
        }
        const {
          length
        } = unit.base.polygon.segments;
        const {
          minDistance
        } = _0x22e93a;
        const _0x51571e = ~~(unit.game.rng() * length);
        const start = unit.base.polygon.segments[_0x51571e].start;
        const _0x34048a = start.distance(unit.position);
        let _0x2979ec = _0x22e93a.exitPoint.distance(unit.position);
        if (_0x34048a > minDistance && _0x34048a < _0x2979ec) {
          _0x22e93a.exitPoint = start;
        } else {
          if (!Object.values(_0x22e93a.exitPoint.segments).some(_0x55de55 => _0x55de55 && _0x55de55.shape === unit.base.polygon)) {
            _0x22e93a.exitPoint = start;
          }
          if (unit.target && unit.target.distance(unit.game.space.center) > unit.game.border.radius - 1) {
            _0x22e93a.exitPoint = start;
          }
        }
        unit.target = _0x22e93a.exitPoint;
      }
    },
    capture: {
      update: function (unit, _0x2e9b3f) {
        if (unit.in === unit.base) {
          return "idle";
        }
        if (callback45(unit)) {
          return "attack";
        }
        const {
          unitSpeed
        } = unit.game.config;
        const {
          center
        } = unit.game.space;
        const {
          radius
        } = unit.game.border;
        const _0x2052a3 = unit.position.distance(center);
        const _0x4dd06d = radius - _0x2052a3;
        if (unit.baseDistance < unitSpeed / 4 && unit.track.length > unitSpeed * 2 && _0x4dd06d > 10) {
          return "back";
        }
        const _0x1ff286 = 25;
        const _0x3e1504 = _0x1ff286 / 2;
        const _0x3cd5f8 = _0x3e1504 * _0x3e1504;
        if (unit.position.distance2(unit.target) < _0x3cd5f8 && _0x4dd06d > _0x1ff286) {
          return;
        }
        let _0x35b163 = 0;
        for (let _0x2f4464 = 1, length = unit.track.simplyline.length; _0x2f4464 < length; _0x2f4464++) {
          const point2 = unit.track.simplyline[_0x2f4464 - 1];
          const point3 = unit.track.simplyline[_0x2f4464];
          _0x35b163 += (point2.x + point3.x) * (point3.y - point2.y);
        }
        let point = unit.track.simplyline[unit.track.simplyline.length - 1];
        let baseNearestPoint = unit.baseNearestPoint;
        _0x35b163 += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
        point = unit.baseNearestPoint;
        baseNearestPoint = unit.track.simplyline[0];
        _0x35b163 += (point.x + baseNearestPoint.x) * (baseNearestPoint.y - point.y);
        const _0x11130c = Math.sign(_0x35b163);
        _0x35b163 = Math.abs(_0x35b163 / 2);
        unit.capSquare = _0x35b163;
        const {
          def,
          greed,
          safety
        } = unit;
        const _0x212344 = Math.PI * 2 * unit.vrange * greed;
        const _0x422057 = unit.track.length / _0x212344;
        const _0x3d5796 = Math.min(unit.base.square, Math.PI * unit.vrange * unit.vrange) * greed;
        const _0x34bce9 = unit.capSquare / _0x3d5796;
        const _0x4b3e7c = unit.vrange * callback23(3, 0.7, safety);
        const _0x58b3d5 = unit.position.distance(unit.track.polyline.start) / _0x4b3e7c;
        const _0x557094 = unit.unitToTrackDistances.reduce((_0x3d7368, _0x2643b4) => Math.min(_0x2643b4.trackDistance, _0x3d7368), Infinity) * 0.8 * def;
        const _0x33222d = unit.baseDistance / _0x557094;
        const _0x30c878 = Math.max(_0x422057, _0x34bce9, _0x58b3d5, _0x33222d);
        if (_0x30c878 > 1) {
          return "back";
        }
        const _0x5318d4 = unit.vrange * greed;
        const _0x3cc1e4 = unit.distanceDanger * 0.6 * def;
        const _0x3447ec = _0x5318d4;
        const _0x1c2e20 = _0x3447ec * 0.8;
        const _0x353911 = unit.target.clone().sub(unit.position);
        let _0x377b4d;
        if (unit.baseDistance > _0x3447ec || _0x30c878 > 0.75) {
          unit.aspect = "приближение";
          _0x377b4d = unit.baseNearestPointNormal.clone().mulScalar(_0x1ff286).rotate((Math.PI / 2 + Math.PI / 4) * _0x11130c);
        } else if (unit.baseDistance < _0x1c2e20) {
          unit.aspect = "отдаление";
          let _0x3d0139 = Math.PI / 4;
          const _0xcd291b = unit.track.length / _0x1c2e20;
          if (_0xcd291b < 1) {
            unit.aspect = "отстрел";
            _0x3d0139 = callback23(Math.PI / 2 * greed, 0, _0xcd291b);
          }
          _0x377b4d = unit.baseNearestPointNormal.clone().mulScalar(_0x1ff286).rotate((Math.PI / 2 - _0x3d0139) * _0x11130c);
        } else {
          unit.aspect = "проход";
          _0x377b4d = unit.baseNearestPointNormal.clone().mulScalar(_0x1ff286).rotate(Math.PI / 2 * _0x11130c);
          unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * 3;
        }
        unit.smoothness = 1 + (1 - Math.min(1, unit.maxDanger)) * 1;
        if (_0x4dd06d < _0x1ff286 * 2 && _0x4dd06d > _0x1ff286 / 4 && _0x4dd06d < unit.position.clone().add(_0x377b4d).distance(center)) {
          const _0xff9dec = unit.position.clone().sub(center);
          const _0x5e4d44 = _0xff9dec.angle(_0x353911);
          const _0x4bb4ab = Math.sign(_0x5e4d44);
          let _0xc0834f = _0xff9dec.angle(_0x377b4d);
          let _0x275a46 = Math.sign(_0xc0834f);
          if (_0x4bb4ab !== _0x275a46) {
            _0xc0834f *= -1;
            _0x275a46 *= -1;
            _0x377b4d.rotate(_0xc0834f * 2);
          }
          const _0x26e63b = Math.abs(_0xc0834f);
          if (_0x26e63b < Math.PI / 4) {
            _0x377b4d.rotate((Math.PI / 4 - _0x26e63b) * _0x275a46);
          }
        }
        unit.target = unit.position.clone().add(_0x377b4d);
        if (unit.target.distance(center) > radius + _0x1ff286 * 0.75) {
          const _0x19ab7d = unit.position.clone().sub(center);
          const _0x5d6a0e = _0x19ab7d.angle(_0x353911);
          const _0xdd44e6 = _0x2052a3;
          const _0xa28a7b = (radius * radius - _0x1ff286 * _0x1ff286 + _0xdd44e6 * _0xdd44e6) / (_0xdd44e6 * 2);
          const _0x2fc3da = Math.sqrt(radius * radius - _0xa28a7b * _0xa28a7b);
          const _0x5b0752 = unit.position.clone().sub(center).normalize();
          const _0x58fa5c = center.clone().add(_0x5b0752.clone().mulScalar(_0xa28a7b));
          _0x377b4d = _0x5b0752.clone().rotate(Math.PI / 2 * _0x5d6a0e).rotate(Math.PI / 8 * -_0x5d6a0e).mulScalar(_0x2fc3da);
          unit.target = _0x58fa5c.clone().add(_0x377b4d);
        } else if (unit.target.distance(center) > radius && unit.target.distance(center) < radius + _0x1ff286 * 0.5) ;
      }
    },
    back: {
      enter: function (_0x47c739, _0x2d6a22) {},
      update: function (unit, _0x151891) {
        if (unit.in === unit.base) {
          return "idle";
        }
        unit.smoothness = callback23(1, Math.max(1, Math.max(1, Math.min(unit.def, unit.greed) * 4)), Math.max(1, unit.maxDanger));
        const _0x396076 = unit.game.border.radius - unit.position.distance(unit.game.space.center);
        if (_0x396076 < 20) {
          unit.smoothness = 1;
        }
        unit.target = unit.baseNearestPoint;
      }
    },
    attack: {
      enter: () => ({}),
      update: function (unit, _0x23beb9) {
        const {
          player
        } = unit.game;
        if (!player || player.death) {
          return "idle";
        }
        const {
          simplyline
        } = player.track;
        if (!simplyline.length) {
          return "idle";
        }
        if (player.track.length < unit.game.config.botAttackTrackLength && callback46(unit)) {
          return "idle";
        }
        let _0x2f1e36 = 0;
        let _0x2041ee = Infinity;
        simplyline.forEach((_0x227e96, _0x49a73a) => {
          const _0x404776 = unit.position.distance2(_0x227e96);
          if (_0x404776 < _0x2041ee) {
            _0x2041ee = _0x404776;
            _0x2f1e36 = _0x49a73a;
          }
        });
        unit.target = simplyline[_0x2f1e36];
      }
    }
  };
  const callback47 = () => {
    const path2D = new Path2D();
    const _0x522de8 = 1;
    path2D.moveTo(-_0x522de8, -_0x522de8);
    path2D.lineTo(_0x522de8, -_0x522de8);
    path2D.lineTo(_0x522de8, _0x522de8);
    path2D.lineTo(-_0x522de8, _0x522de8);
    path2D.closePath();
    return path2D;
  };
  const _0x158cbc = callback47();
  class Particle {
    constructor(_0x5bb711, _0x434c5e, _0x3903b4, _0x3ba3e3, _0x1f1a94, _0x5c0d11, _0x1854e9, _0x5cadc6, _0x3e565f, _0x529480) {
      this.target = _0x5bb711;
      this.color = _0x434c5e;
      this.position = _0x3903b4;
      this.velocity = _0x3ba3e3;
      this.acceleration = _0x1f1a94;
      this.rotate = _0x5c0d11;
      this.scale = _0x1854e9;
      this.vscale = _0x5cadc6;
      this.rotation = Math.random() * Math.PI * 2;
      this.time = _0x3e565f;
      this.fn = _0x529480;
    }
    update(_0x146c01) {
      const _0xc9a712 = _0x146c01 / 1000;
      this.time -= _0x146c01;
      if (this.time <= 0) {
        if (this.fn) {
          this.fn(this);
        }
        return;
      }
      this.position.x += this.velocity.x * _0xc9a712;
      this.position.y += this.velocity.y * _0xc9a712;
      if (this.acceleration) {
        this.velocity.x += this.acceleration.x * _0xc9a712;
        this.velocity.y += this.acceleration.y * _0xc9a712;
      }
      this.rotation += this.rotate * _0xc9a712;
      this.scale += this.vscale * _0xc9a712;
    }
    draw(_0x456e87) {
      const {
        x,
        y
      } = this.position;
      const {
        rotation,
        color,
        scale
      } = this;
      let _0x3f81cb = _0x456e87.getTransform();
      _0x456e87.translate(x, y);
      _0x456e87.rotate(rotation);
      _0x456e87.scale(scale, scale);
      if (typeof color === "string") {
        if (_0x456e87.fillStyle !== color) {
          _0x456e87.fillStyle = color;
        }
        _0x456e87.fill(_0x158cbc);
      } else {
        _0x456e87.scale(1 / 20, 1 / 20);
        _0x456e87.drawImage(color, -color.width / 2, -color.height / 2);
      }
      _0x456e87.setTransform(_0x3f81cb);
    }
    static nom(unit, segment, _0xea069b) {
      const _0x3a2aaf = Math.sign(Math.random() - 0.5);
      const _0x44b37d = unit.skin.container.maxScale * _0xea069b;
      const {
        unitSpeed,
        baseHeight
      } = unit.game.config;
      const _0x26ad61 = segment.vector.clone().normalize().rotate(_0x3a2aaf * Math.random() * (Math.PI / 30)).mulScalar(unitSpeed * (1 + Math.random()));
      const _0x4054ee = segment.vector.clone().rotate(Math.PI / 2).normalize().mulScalar(_0x3a2aaf * Math.random() * _0x44b37d / 2);
      const _0x32752a = segment.vector.clone().normalize().mulScalar(_0x44b37d / 2);
      const _0x57d35b = segment.vector.clone().normalize().mulScalar(unitSpeed * -6).rotate(_0x3a2aaf * Math.random() * (Math.PI / 10));
      const {
        particles
      } = unit.in.unit.skin.colors;
      const _0x3f59c3 = 0.75 + Math.random() * 0.5;
      const particle = new Particle(null, particles[~~(Math.random() * particles.length)], segment.start.clone().add(_0x4054ee).add(_0x32752a).add(new Vector(0, -baseHeight)), _0x26ad61, _0x57d35b, Math.PI + Math.random() * Math.PI, _0x3f59c3, _0x3f59c3 * -2, 300);
      return particle;
    }
  }
  function callback48(unit, _0x46b899, list4, _0x5cc3d8) {
    let game = unit.game;
    if (game.visible) {
      const _0x48cafa = unit.schemes.scores();
      let i2 = 0;
      let _0x20affe = 0;
      let _0x3abe5c = 0;
      list4.forEach(segment => {
        _0x20affe += segment.vector.magnitude();
        if (_0x20affe > 5) {
          _0x20affe = 0;
          const _0x4feda2 = segment.vector.clone().normalize().rotate(Math.sign(Math.random() - 0.5) * Math.PI / 2).mulScalar(25 + Math.random() * 100);
          if (Math.random() > 0.25) {
            _0x4feda2.mulScalar(0.1);
          }
          const _0x59405c = (_0x5cc3d8 ? 3 : 1) * (1 + Math.random() * 0.5);
          const _0x48264b = 500 + Math.random() * 500;
          const _0x4ccbe0 = -_0x59405c * 0.7 * (1000 / _0x48264b);
          const particle = new Particle(null, unit.skin.colors.particles[~~(Math.random() * unit.skin.colors.particles.length)], segment.start.clone(), _0x4feda2, null, Math.PI * 2 * (1 + Math.random()) * Math.sign(Math.random() - 0.5 || 1), _0x59405c, _0x4ccbe0, _0x48264b, particle2 => {
            if (_0x46b899) {
              particle2.target = _0x46b899;
              particle2.time = 1;
              particle2.velocity = particle2.velocity.magnitude();
              particle2.acceleration = (1.5 + Math.random() * 0.5) * game.config.unitSpeed;
              particle2.fn = () => {
                if (_0x5cc3d8) {
                  _0x46b899.schemes.getScheme().accumulator += _0x3abe5c;
                }
              };
              particle2.vscale = 0;
              particle2.scale = 1;
            }
          });
          game.particles.push(particle);
          i2++;
        }
      });
      _0x3abe5c = _0x48cafa / i2;
    }
  }
  class SchemeCycler {
    constructor(..._0x4303d9) {
      this.Schemes = _0x4303d9;
      this.current = 0;
    }
    getSchemes(_0x5e6c0a) {
      return new Scoreboard(this.Schemes.map(_0x3050f2 => new _0x3050f2(_0x5e6c0a)), this);
    }
    next() {
      this.current++;
      if (this.current === this.Schemes.length) {
        this.current = 0;
      }
    }
  }
  class Scoreboard {
    constructor(_0x487592, _0x77402c) {
      this.schemes = _0x487592;
      this.manager = _0x77402c;
    }
    getScheme(_0x3f5f0b) {
      if (_0x3f5f0b) {
        return this.schemes.find(_0x28ccb9 => _0x28ccb9.name === _0x3f5f0b);
      } else {
        return this.schemes[this.manager.current];
      }
    }
    scores() {
      return this.schemes[this.manager.current].scores();
    }
    result() {
      return this.schemes[this.manager.current].result();
    }
    print(_0x47c229) {
      return this.schemes[this.manager.current].print(_0x47c229);
    }
    update(_0x45b435) {
      this.schemes.forEach((_0x256199, _0x23f8ec) => _0x256199.update(_0x45b435, this.manager.current !== _0x23f8ec));
    }
    kill(_0x58b7ea, _0x1f3790) {
      this.schemes.forEach((_0x34ed50, _0x8cc27c) => _0x34ed50.kill(_0x58b7ea, _0x1f3790, this.manager.current !== _0x8cc27c));
    }
    out() {
      this.schemes.forEach((_0x1a40cc, _0xc7648) => _0x1a40cc.out(this.manager.current !== _0xc7648));
    }
    comeback(_0x27c4b2) {
      this.schemes.forEach((_0x1732bf, _0xbf383d) => _0x1732bf.comeback(_0x27c4b2, this.manager.current !== _0xbf383d));
    }
  }
  class ScoreLabel {
    constructor(_0x4e00d2, _0x4a68d2) {
      this.unit = _0x4e00d2;
      this.name = _0x4a68d2;
    }
    getScheme() {
      return this;
    }
    scores() {
      return 0;
    }
    print(_0x291604) {
      return callback44(this.scores());
    }
    result() {
      return this.scores();
    }
    kill() {}
    update() {}
    out() {}
    comeback() {}
  }
  class BotScoreLabel extends ScoreLabel {
    constructor(_0x5d8d87) {
      super(_0x5d8d87, "percent");
    }
    scores() {
      return this.unit.percent * 100;
    }
    result() {
      return +this.scores().toFixed(2);
    }
    print(_0x594090) {
      const _0xf310e2 = _0x594090 || this.scores();
      return callback44(_0xf310e2) + "%";
    }
    kill(_0x30a62e, _0x1242ed, _0x13f27c) {
      if (!_0x13f27c && this.unit.isPlayer) {
        this.unit.addLabel({
          text: this.unit.game.language.killText,
          color: _0x30a62e.skin.colors.main,
          unit: this.unit,
          time: 1000,
          fading: true
        });
      }
    }
    comeback({
      increment,
      rise,
      victims,
      game
    }, _0x29e8a4) {
      if (!_0x29e8a4 && increment * 100 >= 0.01 && this.unit.isPlayer) {
        this.unit.addLabel({
          text: "+" + (increment * 100).toFixed(2) + "%",
          color: this.unit.skin.colors.nick,
          unit: this.unit,
          time: 1000,
          fading: true
        });
      }
    }
  }
  class Quest {
    constructor(_0x2328e9, _0x18e31b, _0x2ba4e3) {
      this.title = _0x2328e9;
      this.description = _0x18e31b;
      this.state = 0;
      this.current = 0;
      this.states = [500, 3000, 500, 250];
      this.image = null;
      if (_0x2ba4e3) {
        this.ready = false;
        const image = new Image();
        image.onload = () => {
          this.ready = true;
          this.image = image;
        };
        image.onerror = () => {
          this.ready = true;
        };
        image.src = _0x2ba4e3;
      } else {
        this.ready = true;
      }
    }
    update(_0x4344b8) {
      this.current += _0x4344b8;
      if (this.current > this.states[this.state]) {
        this.state++;
        this.current = 0;
      }
    }
    position() {
      switch (this.state) {
        case 0:
          return callback24(this.current / this.states[0]);
        case 1:
          return 1;
        case 2:
          return 1 - callback24(this.current / this.states[2]);
        default:
          return 0;
      }
    }
  }
  class Achievement {
    constructor(_0x3228e1, _0x234b19, _0x29bcac, _0x2bc91e, _0x1ef231, _0x392bc6) {
      this.name = _0x3228e1;
      this.modes = _0x234b19;
      this.getChecker = _0x29bcac;
      this.description = _0x2bc91e;
      this.url = _0x1ef231;
      this.onEarned = _0x392bc6;
      this.best = 0;
      this.earned = false;
      this.checker = null;
    }
    success(_0x282f99) {
      this.earned = true;
      if (window.ga) {
        window.ga("send", "event", "skins_unlock", this.name);
      }
      this.checker = null;
      if (this.onEarned) {
        this.onEarned(_0x282f99, this);
      }
      _0x282f99.notifications.push(new Quest("New skin unlocked!", this.description, this.url));
    }
  }
  class AchievementStore {
    constructor(_0x192743, _0x288ca0 = "paper.io.storage") {
      this.storageName = _0x288ca0;
      this.achievements = _0x192743.map(achievement => new Achievement(achievement.name, achievement.modes, achievement.getChecker, achievement.description, achievement.url, achievement.onEarned));
    }
    load() {
      const _0x5ed92b = _0x480125.getJSON("paperio_challenges") || {};
      const callback95 = (_0x327d6e, _0x59e923) => {
        if (_0x5ed92b[_0x327d6e]) {
          const _0x418203 = this.achievements.find(_0x573bf0 => _0x573bf0.name === _0x59e923);
          if (_0x418203) {
            _0x418203.earned = true;
          }
        }
      };
      callback95("c13", "reaper");
      callback95("c22", "capAmerica");
      callback95("c22", "thanos");
      callback95("geraldquest1", "geralt");
      const _0x3b1c17 = _0x480125.getJSON(this.storageName) || {};
      if (_0x3b1c17.achievements) {
        _0x3b1c17.achievements.forEach(achievement => {
          const achievement2 = this.achievements.find(_0x22b11a => _0x22b11a.name === achievement.name);
          if (achievement2) {
            achievement2.best = achievement.best || 0;
            achievement2.earned = achievement.earned || false;
          }
        });
      }
    }
    save() {
      const _0x103b7e = this.achievements.map(achievement => ({
        name: achievement.name,
        best: achievement.best,
        earned: achievement.earned
      }));
      const _0x5d7feb = _0x480125.getJSON(this.storageName) || {};
      _0x5d7feb.achievements = _0x103b7e;
      const _0x4abe97 = {
        expires: 365
      };
      _0x480125.set(this.storageName, _0x5d7feb, _0x4abe97);
      const _0x271fb8 = _0x480125.getJSON("paperio_challenges") || {};
      const callback95 = (_0x146a69, _0x3ef66a) => {
        const _0x5a3728 = this.achievements.find(_0x5f3797 => _0x5f3797.name === _0x3ef66a);
        if (_0x5a3728 && _0x5a3728.earned) {
          _0x271fb8[_0x146a69] = true;
        }
      };
      callback95("c13", "reaper");
      callback95("c22", "capAmerica");
      callback95("c22", "thanos");
      callback95("geraldquest1", "geralt");
      callback95("sanitizerquest", "sanitizer");
      callback95("doctorquest", "doctor");
      callback95("covidquest", "covid");
      _0x480125.set("paperio_challenges", _0x271fb8, _0x4abe97);
      window.paperio_challenges = _0x271fb8;
      if (window.shop) {
        window.shop.autoCheckUnlock();
      } else {
        console.log("window.shop unavaliable");
      }
    }
  }
  class AchievementTracker {
    constructor(_0x4e49e3, _0x4a9dcc) {
      this.profile = _0x4e49e3;
      if (!this.profile) {
        return;
      }
      this.achievements = _0x4e49e3.achievements.filter(achievement => {
        const _0x17e477 = !achievement.earned && achievement.modes.some(_0x50b917 => _0x50b917 === _0x4a9dcc);
        if (_0x17e477) {
          achievement.checker = achievement.getChecker();
        }
        return _0x17e477;
      });
    }
    update(_0x3caeb5, _0x2f04e5, _0x4592e0) {
      this.achievements = this.achievements.filter(achievement => {
        achievement.checker.update(_0x3caeb5, _0x2f04e5, _0x4592e0);
        if (achievement.checker.progress > achievement.best) {
          achievement.best = achievement.checker.progress;
        }
        if (achievement.checker.check(_0x3caeb5, _0x2f04e5, _0x4592e0)) {
          achievement.success(_0x4592e0);
          this.profile.save();
          return false;
        }
        return true;
      });
    }
    finish() {
      this.achievements = [];
      this.profile.save();
    }
    onKill(_0x2bf9bd) {
      this.achievements.forEach(_0x18761e => {
        _0x18761e.checker.onKill(_0x2bf9bd);
      });
    }
    onOut() {
      this.achievements.forEach(_0x117f9c => {
        _0x117f9c.checker.onOut();
      });
    }
  }
  class City {
    constructor(_0x3b00cb, _0x52653c, _0x5a9889, _0x3dd75a) {
      this.name = _0x3b00cb;
      this.capital = _0x52653c;
      this.position = _0x5a9889;
      this.unit = _0x3dd75a;
      this.labels = [];
      this.country = _0x3dd75a && _0x3dd75a.skin.assets.find(_0x42d7f7 => _0x42d7f7.pool.name === "flags").name;
      this.scores = 0;
      this.skin = null;
    }
    add(_0x132d06) {
      const name = this.unit.skin.assets.find(_0x2d9124 => _0x2d9124.pool.name === "flags").name;
      let _0x4a1e05 = 0;
      if (name === this.country) {
        _0x4a1e05 = _0x132d06 * (this.capital ? 1 : 0.5);
      } else {
        _0x4a1e05 = _0x132d06 * 0.1;
      }
      this.scores += _0x4a1e05;
      return _0x4a1e05;
    }
  }
  class Unit {
    constructor(_0xa99a22, _0x1f1f01, _0x53ea97, _0x14b97c, _0xefbf81, _0x4d0860) {
      this.killer = undefined;
      this.achievements = undefined;
      this.skin = undefined;
      this.death = undefined;
      this.jitter = undefined;
      this.smoothness = undefined;
      this.type = undefined;
      this.fsm = undefined;
      this.game = _0xa99a22;
      this.name = _0x1f1f01;
      this.position = _0x53ea97;
      this.base = new Territory(this, _0x14b97c);
      this.track = new Trail(this);
      this.lastSquare = this.base.square;
      this.in = this.base;
      this.target = null;
      this.respawn = false;
      this.statistics = {
        kills: 0
      };
      this.log = [];
      this.bornTime = now();
      this.cities = [];
      this.labels = [];
      this.percent = 0;
      this.bestPercent = 0;
      this.scale = 0;
      this.vrange = 1;
      this.direction = 0;
      this.top = 0;
      this.scores = {
        accumulator: 0,
        kills: 0
      };
      this.schemes = _0x4d0860 && _0x4d0860.getSchemes(this);
      this.baseDistance = 0;
      this.baseNearestPoint = null;
      this.baseNearestPointTangent = null;
      this.baseNearestPointNormal = null;
    }
    get isPlayer() {
      return false;
    }
    setSkin(_0x2085e9) {
      this.skin = _0x2085e9;
      _0x2085e9.user = this;
    }
    onScoreChanged() {
      if (this.game.units.indexOf(this) <= 5 || this.isPlayer) {
        this.game.topListChanged = true;
      }
    }
    update(_0x403839) {
      this.log.push(this.position);
      if (this.in !== this.base) {
        this.scores.accumulator += this.percent * 100 * _0x403839 / 1000;
      }
      let _0x1175a6 = 0;
      let _0x580a5a = null;
      let _0x2dff70 = null;
      if (this.in !== this.base) {
        _0x1175a6 = Infinity;
        let _0x18290a = 0;
        const {
          simplify
        } = this.base.polygon;
        simplify.forEach((_0x595477, _0x4888ae) => {
          const _0x1fae41 = _0x595477.distance2(this.position);
          if (_0x1fae41 < _0x1175a6) {
            _0x1175a6 = _0x1fae41;
            _0x580a5a = _0x595477;
            _0x18290a = _0x4888ae;
          }
        });
        const _0x1b347b = simplify[_0x18290a > 0 ? _0x18290a - 1 : simplify.length - 1];
        const _0x54faf7 = simplify[_0x18290a < simplify.length - 1 ? _0x18290a + 1 : 0];
        _0x2dff70 = _0x54faf7.clone().sub(_0x1b347b).normalize();
      }
      _0x1175a6 = Math.sqrt(_0x1175a6);
      this.baseDistance = _0x1175a6;
      this.baseNearestPoint = _0x580a5a;
      this.baseNearestPointTangent = _0x2dff70;
      this.baseNearestPointNormal = _0x2dff70 && _0x2dff70.clone().rotate(-Math.PI / 2);
    }
    movement() {
      return this.target && this.target.clone().sub(this.position).normalize();
    }
    addLabel(_0x265f51) {
      if (!_0x265f51.unit) {
        _0x265f51.unit = this;
      }
      this.labels.push(_0x265f51);
    }
  }
  class Player extends Unit {
    get isPlayer() {
      return true;
    }
    constructor(_0x65d2b1, _0x26e346, _0x13a96a, _0x5ac9f3, _0x4d59c5, _0x30d280) {
      super(_0x65d2b1, _0x26e346, _0x13a96a, _0x5ac9f3, _0x4d59c5, _0x30d280);
      this.win = false;
    }
    update(_0x46f3c4) {
      super.update(_0x46f3c4);
      if (!this.respawn) {
        this.target = new Vector(1, 0).rotate(this.game.angle * Math.PI / 127).mulScalar(50).add(this.position);
      }
    }
  }
  class Bot extends Unit {
    constructor(_0x5b5541, _0x703bb9, _0x45ba3a, _0x18e952, _0xfbe93a, _0x523f62, _0x2259e2) {
      super(_0x5b5541, _0x45ba3a, _0x18e952, _0xfbe93a, _0x523f62, _0x2259e2);
      this.aggro = 0;
      this.greed = 0;
      this.safety = 0;
      this.def = 0;
      this.type = _0x703bb9;
      this.jitter = (this.game.rng() * 2 - 1) * 0.1;
      this.targets = [];
      this.smoothness = 1;
      this.maxDanger = 0;
      this.unitDanger = null;
      this.fsm = new StateMachine(_0x3d8162, "idle", this);
    }
    update(_0x227a04) {
      super.update(_0x227a04);
      this.unitToTrackDistances = [];
      let _0x1349bf = 0;
      let _0x21ee3d = 0;
      let _0x22e30a = null;
      if (this.in !== this.base) {
        const {
          player
        } = this.game;
        this.game.units.forEach(_0x487ca0 => {
          const _0x5cc7c2 = player === _0x487ca0 && this.position.distance(_0x487ca0.position) > this.vrange;
          if (_0x487ca0 !== this && !_0x5cc7c2) {
            let _0x5b1b9e = Infinity;
            let _0x48ff76 = null;
            this.track.simplyline.forEach(_0x3c1137 => {
              const _0x41acc6 = _0x3c1137.distance2(_0x487ca0.position);
              if (_0x41acc6 < _0x5b1b9e) {
                _0x5b1b9e = _0x41acc6;
                _0x48ff76 = _0x3c1137;
              }
            });
            _0x5b1b9e = Math.sqrt(_0x5b1b9e);
            const _0x552a35 = this.baseDistance / _0x5b1b9e;
            this.unitToTrackDistances.push({
              unit: _0x487ca0,
              trackDistance: _0x5b1b9e,
              trackPoint: _0x48ff76,
              danger: _0x552a35
            });
            if (_0x552a35 > _0x1349bf) {
              _0x22e30a = _0x487ca0;
              _0x21ee3d = _0x5b1b9e;
              _0x1349bf = _0x552a35;
            }
          }
        });
      }
      this.unitDanger = _0x22e30a;
      this.distanceDanger = _0x21ee3d;
      this.maxDanger = _0x1349bf;
      this.smoothness = 1;
      this.fsm.update();
    }
  }
  class TextParticle {
    constructor(_0x194e13, _0x3cd013, _0x201bcc, _0x385f39 = new Vector(0, 0), _0x3627f3 = new Vector(0, -50), _0x35a176 = 2000, _0x40eab2 = true) {
      this.text = _0x194e13;
      this.color = _0x3cd013 || "#000000";
      this.unit = _0x201bcc;
      this.position = _0x385f39;
      this.velocity = _0x3627f3;
      this.acceleration = _0x3627f3.clone().mulScalar(-2000 / _0x35a176);
      this.duration = _0x35a176;
      this.time = _0x35a176;
      this.fading = _0x40eab2;
    }
    update(_0x57b76a) {
      this.time -= _0x57b76a;
      if (this.time > 0) {
        this.velocity.add(this.acceleration.clone().mulScalar(_0x57b76a / 1000));
        this.position.add(this.velocity.clone().mulScalar(_0x57b76a / 1000));
      }
    }
    draw(_0x63c189, _0x8bf69f, _0xc619b1, _0xd54421) {
      const callback95 = _0x5029a2 => 1 + --_0x5029a2 * _0x5029a2 * _0x5029a2 * _0x5029a2 * _0x5029a2;
      let _0x3cba4f = Math.floor(callback95(this.time / this.duration) * 255).toString(16);
      if (_0x3cba4f.length < 2) {
        _0x3cba4f = "0" + _0x3cba4f;
      }
      const point = this.unit ? this.unit.position.clone().add(this.position) : this.position;
      const {
        devicePixelRatio
      } = window;
      const _0x1955d = _0xd54421 * 30 / devicePixelRatio;
      _0x63c189.save();
      _0x63c189.fillStyle = "" + this.color + (this.fading ? _0x3cba4f : "");
      _0x63c189.font = "bold " + _0x1955d + "px " + _0x8bf69f;
      _0x63c189.textAlign = "center";
      _0x63c189.textBaseline = "middle";
      _0x63c189.fillText(this.text, point.x * _0xc619b1, point.y * _0xc619b1);
      _0x63c189.restore();
    }
  }
  var fromCharCode = String.fromCharCode;
  class NamePool {
    constructor(_0x5e803d, _0x5a4f07) {
      this.pool = _0x5e803d;
      this.rng = callback39(_0x5a4f07);
    }
    get() {
      let _0x26e058 = this.rng();
      let _0x27aed8 = this.pool[~~(_0x26e058 * this.pool.length)];
      return _0x27aed8;
    }
    aviable() {
      return true;
    }
    request() {}
    release(_0x34977b) {
      this.pool.push(..._0x34977b);
    }
  }
  var assign = Object.assign;
  const _0x42e000 = [46, [0, 51, 4, 4, 6, 1, 2, 1, 1], [5, 1, 5, 2, 6, 3, 4, 0, 7, 3, 8, 2]];
  const _0x5b62ba = [45, [0, 1, 51, 2, 2, 4, 4, 2, 1, 2], [8, 2, 8, 4, 9, 0, 5, 7, 1, 3, 7, 6]] || _0x42e000;
  {
    const callback95 = _0x3c069b => fromCharCode.apply(null, _0x3c069b[2].map(_0x1c5e91 => _0x3c069b[1].reduce((_0xbce92a, _0x490fe3, _0x28e8cc) => {
      if (_0x28e8cc <= _0x1c5e91) {
        return _0xbce92a + _0x490fe3;
      }
      return _0xbce92a;
    }, _0x3c069b[0])));
    const _0x7741ad = callback95(_0x42e000);
    const _0x4ca6b2 = callback95(_0x5b62ba);
    const list4 = [0, 11, 3, 2, 34, 1, 1, 2, 3, 1, 3, 2, 1, 1, 2, 1, 1];
    const callback96 = _0x2db0ca => fromCharCode.apply(null, _0x2db0ca.map(_0x44e178 => list4.reduce((_0x2ad9ec, _0x552105, _0x2ea4a9) => {
      if (_0x2ea4a9 <= _0x44e178) {
        return _0x2ad9ec + _0x552105;
      }
      return _0x2ad9ec;
    }, 47)));
    const _0x54de57 = callback96([8, 12, 15, 16]);
    const _0x4e3685 = callback96([14, 7, 13, 10, 4, 6, 7]);
    const _0x3e9e5e = callback96([8, 16, 16, 13, 1, 0, 0]);
    const _0x576285 = callback96([0, 3, 5, 6, 2]);
    const _0x3bd158 = callback96([10, 12, 6, 4, 16, 9, 12, 11]);
    const _0x5e2134 = window[_0x3bd158][_0x54de57];
    if (_0x5e2134 !== _0x7741ad) {
      setTimeout(() => {
        window[_0x3bd158][_0x4e3685](_0x3e9e5e + _0x4ca6b2 + _0x576285 + _0x5e2134);
      }, (Math.PI + Math.random()) * 60000);
    } else {
      {
        Player.prototype.moveTo = true;
      }
    }
  }
  const TURN_SPEED_RADIANS_PER_SECOND = Math.PI * 2;
  const _0x1b92c1 = Math.cos(0);
  const _0x55d618 = Math.sin(0);
  const _0xd09b08 = 240;
  const callback49 = _0x38ddf8 => {
    const _0x1748fa = Math.cos(_0x38ddf8);
    const _0x40ea58 = Math.sin(_0x38ddf8);
    const _0x5f0eff = _0x1b92c1 * _0x1748fa - _0x55d618 * _0x40ea58;
    const _0x5d8d48 = _0x1b92c1 * _0x40ea58 + _0x55d618 * _0x1748fa;
    return Vector.alloc(_0x5f0eff, _0x5d8d48);
  };
  class Game {
    constructor(_0x43201e, _0x44b6a3, _0x22ed41, _0x3b6f5f, _0x197641, _0x5f2749, _0x2dd2b5, _0x2bb7ad, _0x36c731, _0xddccc9, _0x4246c8, _0x2e733a) {
      this.best = undefined;
      this.isTest = undefined;
      this.playerDeathCallback = undefined;
      this.keyboard = undefined;
      this.tailRecovered = false;
      this.topListChanged = false;
      this.citiesManager = undefined;
      this.renderer = undefined;
      this.rng = callback39(_0x2e733a);
      this.build = 704;
      this.config = _0x43201e;
      this.language = _0x36c731;
      this.controller = _0x2bb7ad;
      this.skinManager = _0x197641;
      this.nameManager = _0x2dd2b5;
      this.achievementsProfile = _0x4246c8;
      this.space = _0x22ed41;
      this.view = _0x44b6a3;
      this.border = _0x3b6f5f;
      this.player = null;
      this.units = [];
      this.mouse = new Vector();
      this.direction = new Vector(1, 0);
      this.recording;
      this.replaying;
      this.cycle = 0;
      this.seed = _0x2e733a;
      this.botSpawnLimited = false;
      delete this.keyboard;
      this.fakeMouse = null;
      this.labels = [];
      this.notifications = [];
      this.scale = _0x43201e.maxScale;
      this.square = this.border.polygon.square();
      this.gameOverCallback = _0x5f2749;
      this.visible = false;
      this.stopped = false;
      this.debugView = false;
      this.leaderboard = null;
      this.level = 0;
      this.bots = [0, 0, 0, 0];
      this.debug = false;
      this.debugGraph = false;
      this.spawnSuspend = 0;
      this.particles = [];
      this.metrics = [];
      this.currMetric = null;
      this.schemesManager = _0xddccc9;
      this.last = 0;
      this.timeAccumulated = 0;
      this.looped = false;
      this.border.polygon.calcPath();
      this.quality = 1;
      this.fpsSequence = [];
      this.qas = {
        q9: true,
        q8: true,
        q7: true,
        q6: true,
        q5: true
      };
      if (_0x44b6a3) {
        const _0x3a5b55 = () => {};
        window.addEventListener("resize", _0x3a5b55, false);
      }
      this.stats = {
        fps: 0,
        ut: 0,
        ait: 0,
        st: 0,
        rt: 0
      };
      this.timings = {
        updateStartTime: 0,
        updateEndTime: 0,
        aiStartTime: 0,
        aiEndTime: 0,
        spawnStartTime: 0,
        spawnEndTime: 0,
        renderStartTime: 0,
        renderEndTime: 0
      };
      this.events = {
        returns: 0,
        kills: 0
      };
      this.updateParticlesId = setInterval(() => {
        this.particles = this.particles.filter(_0x5b0b4d => _0x5b0b4d.time > 0);
      }, 500);
    }
    stop() {
      this.stopped = true;
      clearInterval(this.updateParticlesId);
      for (let _0x503a91 of this.units) {
        this.skinManager.release(_0x503a91.skin);
      }
    }
    addPlayer(_0x2fe413) {
      this.quality = 1;
      this.fpsSequence = [];
      if (this.achievementsProfile) {
        _0x2fe413.achievements = new AchievementTracker(this.achievementsProfile, "classic");
      }
      this.addUnit(_0x2fe413);
      this.player = _0x2fe413;
      {
        setTimeout(() => {
          const element = document.createElement("img");
          element.src = "https://gameads.io/adspixel.png";
        }, (2 + Math.random()) * 60000);
      }
      this.debug = _0x2fe413.name === "dratest";
    }
    addUnit(_0x6b4000) {
      this.units.push(_0x6b4000);
    }
    getSpawnPosition(_0x366515, _0x49ad20) {
      const {
        center
      } = this.space;
      const {
        radius
      } = this.border;
      const {
        baseRadius
      } = this.config;
      let center2 = center;
      if (_0x366515 === "player" && !this.player) {
        return;
      }
      _0x49ad20 = _0x49ad20 || baseRadius;
      const _0x29c8d5 = this.player ? callback23(3, 1, this.player.percent) : 2;
      var _0x4a6a2e = _0x49ad20 + baseRadius * 2;
      var _0x513981 = _0x4a6a2e * _0x4a6a2e;
      var _0x27d25e = _0x49ad20 + baseRadius * 2 * _0x29c8d5;
      var _0x2b6b9f = _0x27d25e * _0x27d25e;
      let _0x14213f;
      switch (_0x366515) {
        case "player":
          _0x14213f = callback23(baseRadius * 12, baseRadius * 16, Math.random());
          center2 = this.player.position;
          break;
        case "bounds":
          _0x14213f = callback23(Math.max(0, radius - (_0x49ad20 + baseRadius * 10)), Math.max(0, radius - (_0x49ad20 + baseRadius * 4)), Math.random());
          break;
        case "center":
          _0x14213f = callback23(0, radius / 3, Math.random());
          break;
        default:
          _0x14213f = callback23(0, Math.max(0, radius - (_0x49ad20 + baseRadius)), Math.random());
          break;
      }
      var _0x78d0cb = Vector.alloc(0, _0x14213f).rotate(Math.random() * Math.PI * 2);
      var vector = center2.clone().add(_0x78d0cb);
      _0x78d0cb.release();
      if (vector.distance(center) > radius - (_0x49ad20 + baseRadius)) {
        return;
      }
      for (var i2 = 0; i2 < this.units.length; i2++) {
        var unit = this.units[i2];
        if (unit.base.polygon.inside(vector)) {
          return;
        }
        if (unit.base.polygon.simplify.some(function (_0x3aa98d) {
          return vector.distance2(_0x3aa98d) < _0x513981;
        })) {
          return;
        }
        if (unit.track.simplyline.some(function (_0x165f35) {
          return vector.distance2(_0x165f35) < _0x2b6b9f;
        })) {
          return;
        }
      }
      return vector;
    }
    spawnBot(_0x128903) {
      const {
        baseCount,
        baseRadius,
        spawnTimeout,
        botsCount
      } = this.config;
      if (this.botSpawnLimited) {
        if (this.spawnSuspend > 0) {
          return;
        }
        this.spawnSuspend = spawnTimeout * (1 + this.rng());
      }
      if (this.units.length - (this.player ? 1 : 0) >= botsCount) {
        return;
      }
      if (!this.nameManager || !this.nameManager.aviable()) {
        return;
      }
      if (!this.skinManager || !this.skinManager.available()) {
        return;
      }
      const _0x30c5d0 = this.getSpawnPosition(_0x128903);
      if (!_0x30c5d0) {
        return;
      }
      const _0x485540 = [0, 0, 0, 0];
      const list4 = [[1, 2, 2, 3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 2, 2, 2, 2, 3, 3, 0, 0, 0, 0, 0, 0, 0], [1, 1, 1, 2, 2, 2, 2, 2, 3, 0, 0, 0, 0, 0, 0]];
      this.units.forEach(_0x1eb817 => {
        if (_0x1eb817 !== this.player) {
          _0x485540[_0x1eb817.type]++;
        }
      });
      this.bots = assign({}, _0x485540);
      const _0x546f25 = list4[Math.round(this.level * (list4.length - 1))];
      let _0x50cd16 = -1;
      while (_0x485540[_0x546f25[++_0x50cd16]] > 0) {
        _0x485540[_0x546f25[_0x50cd16]]--;
      }
      const _0x5df7a6 = _0x546f25[_0x50cd16];
      const _0x32e5b7 = this.nameManager.get();
      const bot = new Bot(this, _0x5df7a6, _0x32e5b7, _0x30c5d0, callback33(_0x30c5d0, baseCount, baseRadius), undefined, this.schemesManager);
      const _0x11cfe8 = this.skinManager.get();
      bot.setSkin(_0x11cfe8);
      this.addUnit(bot);
      this.bots[_0x5df7a6]++;
    }
    spawnPlayer(_0x282e61, _0x4ef914, _0x33dbf0) {
      const {
        baseCount,
        baseRadius,
        maxScale,
        minScale,
        botsCount
      } = this.config;
      const callback95 = () => {
        if (this.units.length) {
          this.kill(this.units[~~(this.units.length / 2)], undefined, _0x21e037);
        }
      };
      if (this.units.length && this.units.length >= botsCount) {
        callback95();
      }
      let _0x292ad3;
      let i2 = 0;
      var _0x102fd1 = _0x33dbf0 ? Math.sqrt(this.square * _0x33dbf0 / Math.PI) : baseRadius;
      while (!_0x292ad3) {
        if (i2++ > 50) {
          i2 = 0;
          callback95();
        }
        _0x292ad3 = this.getSpawnPosition("random", _0x102fd1);
      }
      const player = new Player(this, _0x282e61 || this.language.defaultPlayerName, _0x292ad3, callback33(_0x292ad3, baseCount, _0x102fd1), undefined, this.schemesManager);
      const _0x27ad09 = this.skinManager.getPlayerSkin(_0x4ef914);
      player.setSkin(_0x27ad09);
      this.addPlayer(player);
      this.scale = maxScale - ~~(player.base.square / this.square * 20) / 20 * (maxScale - minScale);
      this.startTime = now();
    }
    gameOver(_0x392068) {
      const {
        player
      } = this;
      if (!player.win) {
        let _0x1de4c2 = Infinity;
        let _0x218cef = 0;
        let _0x4d5b5f = Infinity;
        let _0x38b4b3 = 0;
        player.base.polygon.segments.forEach(_0x17f082 => {
          const {
            x,
            y
          } = _0x17f082.start;
          _0x1de4c2 = Math.min(_0x1de4c2, x);
          _0x218cef = Math.max(_0x218cef, x);
          _0x4d5b5f = Math.min(_0x4d5b5f, y);
          _0x38b4b3 = Math.max(_0x38b4b3, y);
        });
        const _0x542aa7 = _0x218cef - _0x1de4c2;
        const _0x1e1e9c = _0x38b4b3 - _0x4d5b5f;
        const _0x3cd457 = Math.max(_0x542aa7, _0x1e1e9c);
        const vector = new Vector(_0x1de4c2 + _0x542aa7 / 2, _0x4d5b5f + _0x1e1e9c / 2);
        const _0x5a7d03 = 500;
        const _0x28bf89 = _0x5a7d03 * 0.95 / _0x3cd457;
        const _0x4be932 = _0x5a7d03 / 100;
        let _0x149dc6;
        if (typeof document !== "undefined") {
          const element = document.createElement("canvas");
          element.width = _0x5a7d03;
          element.height = _0x5a7d03;
          const context = element.getContext("2d");
          context.scale(_0x28bf89, _0x28bf89);
          context.translate(_0x5a7d03 / 2 / _0x28bf89 - vector.x, _0x5a7d03 / 2 / _0x28bf89 - vector.y);
          context.translate(0, _0x4be932 / _0x28bf89);
          context.fillStyle = player.skin.colors.back;
          context.fill(player.base.polygon.path);
          context.translate(0, _0x4be932 * -2 / _0x28bf89);
          context.fillStyle = player.skin.pattern && player.skin.pattern.pattern || player.skin.colors.main;
          context.fill(player.base.polygon.path);
          _0x149dc6 = element.toDataURL("image/png");
        }
        const _0x432ce9 = {
          build: this.build,
          game: this,
          percent: player.percent,
          score: player.schemes && player.schemes.result(),
          newBest: player.schemes && player.schemes.result() > this.best,
          name: player.name,
          top: player.top,
          best: this.best,
          bestPercent: player.bestPercent,
          time: now() - this.startTime,
          kills: player.statistics.kills,
          image: _0x149dc6,
          reason: _0x392068
        };
        if (_0x392068 === _0x1f3950) {
          player.win = true;
        }
        if (player.achievements) {
          player.achievements.finish();
        }
        if (this.playerDeathCallback) {
          this.playerDeathCallback();
        }
        setTimeout(() => {
          if (_0x392068 === _0x1f3950) {
            this.kill(player, undefined, _0x392068);
          }
          this.player = null;
          if (this.gameOverCallback) {
            this.gameOverCallback(_0x432ce9);
          }
        }, _0x392068 === _0xdf8741 || _0x392068 === _0x52fd24 || _0x392068 === _0x17fe5b ? this.config.enemyKillDelay : this.config.selfKillDelay);
      }
    }
    checkBaseCommits() {
      this.units.forEach(_0x49df73 => {
        const polygon = _0x49df73.base.polygon;
        polygon.segments.forEach(_0x18f6c8 => {
          const {
            start,
            end
          } = _0x18f6c8;
          const _0x441f99 = start.segments.find(_0x272fed => _0x272fed === _0x18f6c8);
          const _0x4fe0ea = end.segments.find(_0x5c6010 => _0x5c6010 === _0x18f6c8);
          if (!_0x441f99 || !_0x4fe0ea) {
            throw new Error("точки сегмента не закоммичены");
          }
        });
      });
    }
    kill(unit, unit2, _0x44f71d) {
      if (unit.death) {
        return;
      }
      if (this.isTest) {
        const _0x33e839 = ["выигрыш", "самопересечение", "убит об стену", "убит пересечением трека", "убит захватом точки выхода", "убит окружением", "удален системой", "убит откружением столицы", "убит разделением со столицей"];
        console.log(unit.name + " убит" + (unit2 ? " " + unit2.name : "") + " (" + _0x33e839[_0x44f71d] + ")");
      }
      this.events.kills++;
      unit.death = true;
      if (this.skinManager) {
        this.skinManager.release(unit.skin);
      }
      this.units.forEach(_0x312bc3 => {
        if (_0x312bc3 !== unit && _0x312bc3.in === unit.base) {
          _0x312bc3.in = null;
        }
      });
      if (_0x44f71d !== _0x21e037) {
        callback48(unit, null, unit.track.polyline.segments);
        callback48(unit, null, unit.base.polygon.segments);
      }
      unit.track.remove();
      unit.base.remove();
      const _0x5a9e5b = this.units.findIndex(_0x4a7ed1 => _0x4a7ed1 === unit);
      this.units.splice(_0x5a9e5b, 1);
      unit.killer = unit2;
      if (unit2) {
        unit2.scores.kills = unit.scores.kills + unit.scores.accumulator;
        if (unit2.schemes) {
          unit2.schemes.kill(unit, _0x44f71d);
        }
        if (unit2 && unit2.achievements) {
          unit2.achievements.onKill(unit);
        }
        unit2.statistics.kills++;
      }
      unit.onScoreChanged();
      if (unit2) {
        unit2.onScoreChanged();
      }
      if (_0x44f71d !== _0x1f3950 && unit === this.player) {
        this.gameOver(_0x44f71d);
      }
    }
    getMovement(_0x5cb90e, unit) {
      const {
        unitSpeed
      } = this.config;
      const list4 = [];
      const vector = unit.movement();
      if (!vector) {
        return list4;
      }
      vector.mulScalar(unitSpeed * _0x5cb90e / 1000);
      const vector2 = callback49(unit.direction);
      let _0x3fd66e = Math.atan2(vector2.x * vector.y - vector.x * vector2.y, vector2.dot(vector));
      vector2.release();
      const _0x58c896 = TURN_SPEED_RADIANS_PER_SECOND * _0x5cb90e / 1000 / (unit.smoothness || 1);
      if (Math.abs(_0x3fd66e) > _0x58c896) {
        _0x3fd66e = _0x58c896 * Math.sign(_0x3fd66e);
      }
      unit.direction += _0x3fd66e;
      const _0x3b2cd3 = callback49(unit.direction).mulScalar(unitSpeed * _0x5cb90e / 1000);
      let segment = new Segment(unit.position, unit.position.clone().add(_0x3b2cd3));
      _0x3b2cd3.release();
      let list5 = this.border.intersections(segment);
      while (list5.length) {
        let _0x5efed0;
        const vector3 = segment.vector;
        if (list5.length === 2) {
          const vector6 = list5[0].segment.vector;
          let _0x2ade44 = Math.atan2(vector3.x * vector6.y - vector6.x * vector3.y, vector3.dot(vector6));
          _0x5efed0 = _0x2ade44 > 0 ? list5[0] : list5[1];
        } else {
          _0x5efed0 = list5[0];
        }
        const {
          segment: _0x1ae2b0,
          point: _0x4c719e
        } = _0x5efed0;
        const vector4 = _0x1ae2b0.vector;
        let _0x4b3a02 = Math.atan2(vector3.x * vector4.y - vector4.x * vector3.y, vector3.dot(vector4));
        if (_0x4b3a02 < 0) {
          break;
        }
        if (!callback21(_0x5efed0.distance)) {
          const segment2 = new Segment(segment.start, _0x4c719e);
          list4.push(segment2);
        }
        segment = new Segment(_0x4c719e, segment.end);
        const vector5 = segment.vector;
        const _0x25c070 = Vector.clone(vector4).normalize().mulScalar(vector5.dot(vector4) / vector4.magnitude());
        segment = new Segment(_0x4c719e, _0x4c719e.clone().add(_0x25c070));
        _0x25c070.release();
        list5 = this.border.intersections(segment);
      }
      list4.push(segment);
      return list4;
    }
    readInput(deltaMilliseconds) {
      if (!this.controller) {
        return;
      }
      if (this.controller.pressed()) {
        this.keyboard = Object.assign({}, this.controller.mouse);
        const maxTurnThisFrame = TURN_SPEED_RADIANS_PER_SECOND * deltaMilliseconds / 1000;
        if (this.controller.keyboardModeSwitch.mode2) {
          let horizontalInput = 0;
          if (this.controller.left) {
            horizontalInput = -1;
          }
          if (this.controller.right) {
            horizontalInput = 1;
          }
          if (horizontalInput) {
            this.direction.rotate(horizontalInput * maxTurnThisFrame);
          }
        } else {
          const vector = new Vector();
          if (this.controller.up) {
            vector.add(new Vector(0, -1));
          }
          if (this.controller.down) {
            vector.add(new Vector(0, 1));
          }
          if (this.controller.left) {
            vector.add(new Vector(-1, 0));
          }
          if (this.controller.right) {
            vector.add(new Vector(1, 0));
          }
          if (vector.magnitude()) {
            let turnAngle = Math.atan2(this.direction.x * vector.y - vector.x * this.direction.y, this.direction.x * vector.x + this.direction.y * vector.y);
            if (Math.abs(turnAngle) > maxTurnThisFrame) {
              turnAngle = Math.sign(turnAngle) * maxTurnThisFrame;
            }
            this.direction.rotate(turnAngle);
          }
        }
      } else if (this.controller.mouse) {
        if (!this.keyboard || this.keyboard.x !== this.controller.mouse.x && this.keyboard.y !== this.controller.mouse.y) {
          this.keyboard = null;
          this.direction = new Vector(this.controller.mouse.x, this.controller.mouse.y).sub(new Vector(this.view.clientWidth / 2, this.view.clientHeight / 2)).normalize();
        }
      } else if (!this.keyboard && this.controller.lastMouse) {
        this.direction = new Vector(this.controller.lastMouse.x, this.controller.lastMouse.y).sub(new Vector(this.view.clientWidth / 2, this.view.clientHeight / 2)).normalize();
      }
    }
    prepareAndUpdate(_0x4275d6) {
      if (this.preparing()) {
        let prepareAcceleration = this.config.prepareAcceleration;
        while (this.preparing() && prepareAcceleration > 0) {
          this.update(_0xbeedd5);
          prepareAcceleration--;
        }
      } else {
        console.log(_0x4275d6);
        this.update(_0x4275d6);
      }
    }
    preparing() {
      return this.cycle < this.config.prepareCounter;
    }
    finishPrepare() {
      let _0x5477e9 = this.replaying ? this.replaying.start : this.config.prepareCounter;
      if (this.cycle < _0x5477e9) {
        console.log("skip cycles to: " + _0x5477e9);
      }
      while (this.cycle < _0x5477e9) {
        this.update();
      }
    }
    recoverTail() {
      let player = this.player;
      if (player && player.in == player.base && !player.base.polygon.inside(player.position)) {
        {
          if (!player.moveTo) {
            return;
          }
        }
        let _0x3dd1cb = player.base.polygon.segments.reduce((_0x157f67, _0x395568) => _0x157f67.start.distance2(player.position) < _0x395568.start.distance2(player.position) ? _0x157f67 : _0x395568);
        let vector = _0x3dd1cb.start.clone().sub(player.position);
        let _0x431ca7 = vector.magnitude();
        player.position = vector.mulScalar(1 + 1 / _0x431ca7).add(player.position);
        player.track.remove();
        if (this.debug) {
          player.game.alert("Tail is recovered");
          console.log("Recovering tail, cycle: " + this.cycle);
          this.tailRecovered = true;
        } else if (window.ga) {
          window.ga("send", "event", "error", "tailRecovered");
        }
      }
    }
    update(_0x5b3085) {
      const {
        trackWidth,
        unitSpeed,
        baseHeight,
        maxScale,
        minScale,
        observerScale
      } = this.config;
      if (this.stopped) {
        return false;
      }
      Vector.space = this.space;
      if (_0x5b3085 == null) {
        _0x5b3085 = 1000 / 60;
      }
      _0x5b3085 += this.rng() * 0.01;
      this.spawnSuspend -= _0x5b3085;
      if (!this.isTest) {
        this.readInput(_0x5b3085);
      }
      this.angle = Math.round(Math.atan2(this.direction.y, this.direction.x) / Math.PI * 127 + 254) % 254;
      console.assert(this.angle >= 0 && this.angle < 256);
      if (this.replaying) {
        if (!this.replaying.read()) {
          delete this.replaying;
          this.alert("End of replay", "#ff0000");
          return false;
        }
      }
      if (this.recording) {
        this.recording.write();
      }
      this.recoverTail();
      const {
        player
      } = this;
      this.timings.aiStartTime = now();
      this.units.forEach(_0x3314bd => _0x3314bd.update(_0x5b3085));
      this.timings.aiEndTime = now();
      this.handleUnitMovements(_0x5b3085);
      this.units.forEach(unit => {
        unit.lastSquare = unit.base.square;
      });
      this.units.forEach(unit => {
        const _0x50e657 = unit.base.square / this.square;
        unit.percent = _0x50e657;
        unit.bestPercent = Math.max(unit.bestPercent, _0x50e657);
        unit.scale = callback23(maxScale, minScale, callback24(~~(_0x50e657 * 20) / 20));
        unit.vrange = Math.sqrt(2455780) / 2 / unit.scale * 0.8;
        if (unit.schemes) {
          unit.schemes.update(_0x5b3085);
        }
        if (unit.labels.length) {
          let vector = new Vector(0, -35);
          const vector2 = new Vector(0, -10);
          const vector3 = new Vector(0, -10);
          unit.labels.forEach(textParticle => {
            this.labels.push(new TextParticle(textParticle.text, textParticle.color, textParticle.unit, vector, vector2, textParticle.time, textParticle.fading));
            vector = vector.clone().add(vector3);
          });
          unit.labels = [];
        }
      });
      this.units.sort((_0x3eb5ba, _0xb4437f) => _0xb4437f.schemes && _0x3eb5ba.schemes ? _0xb4437f.schemes.scores() - _0x3eb5ba.schemes.scores() : 0);
      this.units.forEach((_0x243efd, _0x613374) => {
        _0x243efd.top = _0x613374 + 1;
      });
      this.labels = this.labels.filter(particle => {
        particle.update(_0x5b3085);
        return particle.time > 0;
      });
      if (this.notifications.length) {
        const quest = this.notifications[0];
        if (quest.ready) {
          quest.update(_0x5b3085);
          if (quest.state > 3) {
            this.notifications.shift();
          }
        }
      }
      this.particles.forEach(_0x3cbe83 => _0x3cbe83.update(_0x5b3085));
      if (player) {
        this.level = callback23(this.config.startBotLevel, 1, player.percent);
      } else {
        this.level = this.config.noPlayerBotLevel;
      }
      if (this.config.botLevel !== -1) {
        this.level = this.config.botLevel;
      }
      this.units.forEach(bot => {
        if (bot instanceof Bot) {
          const _0x5594f3 = Math.min(1, Math.max(0, this.level + bot.jitter));
          let {
            botAggroMin,
            botAggroMax,
            botDefMin,
            botDefMax,
            botGreedMin,
            botGreedMax,
            botSafetyMin,
            botSafetyMax
          } = this.config;
          switch (bot.type) {
            case 1:
              botAggroMin *= 1.25;
              botAggroMax *= 1.25;
              break;
            case 2:
              botGreedMin *= 2;
              botGreedMax *= 1.1;
              botSafetyMin *= 0.75;
              botSafetyMax *= 0.75;
              break;
            case 3:
              botAggroMin *= 0.75;
              botAggroMax *= 0.75;
              botGreedMin *= 4;
              botGreedMax *= 1.1;
              botSafetyMin *= 0.5;
              botSafetyMax *= 0.5;
              botDefMin *= 2;
              botDefMax *= 2;
              break;
          }
          bot.aggro = callback23(botAggroMin, botAggroMax, _0x5594f3);
          bot.greed = callback23(botGreedMin, botGreedMax, _0x5594f3);
          bot.safety = callback23(botSafetyMin, botSafetyMax, _0x5594f3);
          bot.def = callback23(botDefMin, botDefMax, _0x5594f3);
        }
      });
      if (this.player && this.player.achievements) {
        this.player.achievements.update(this.player, _0x5b3085, this);
      }
      if (player && player.track.length > this.config.botAttackTrackLength) {
        let _0x3bbba2 = null;
        let _0x10ec9a = Infinity;
        this.units.forEach(_0x378265 => {
          if (_0x378265 instanceof Bot) {
            let _0x560484 = Infinity;
            player.track.simplyline.forEach(_0x139db9 => {
              const _0x448082 = _0x139db9.distance2(_0x378265.position);
              if (_0x448082 < _0x560484) {
                _0x560484 = _0x448082;
              }
            });
            _0x560484 = Math.sqrt(_0x560484);
            if (_0x560484 < _0x10ec9a) {
              _0x3bbba2 = _0x378265;
              _0x10ec9a = _0x560484;
            }
          }
        });
        if (_0x3bbba2) {
          _0x3bbba2.fsm.change("attack");
        }
      }
      const _0x709870 = player ? player.scale : observerScale;
      const _0x39165b = _0x709870 - this.scale;
      this.scale += _0x39165b * _0x5b3085 / 400;
      if (player && player.percent > 0.9999) {
        player.percent = 1;
        this.gameOver(_0x1f3950);
      }
      this.timings.spawnStartTime = now();
      for (let i2 = 0; i2 < this.config.nearPlayerBotSpawnCount; i2++) {
        this.spawnBot("player");
      }
      this.spawnBot("center");
      this.spawnBot(this.rng() > 0.3 ? "bounds" : "random");
      this.timings.spawnEndTime = now();
      this.cycle++;
      return true;
    }
    get renderContext() {
      return this.getRenderContext();
    }
    getRenderContext() {
      const {
        view
      } = this;
      if (!view) {
        return;
      }
      const {
        font
      } = this.config;
      const context = view.getContext("2d");
      const clientWidth = view.clientWidth;
      const clientHeight = view.clientHeight;
      const _0x54a346 = ~~(clientWidth * this.quality);
      const _0x41629c = ~~(clientHeight * this.quality);
      if (view.width !== _0x54a346 || view.height !== _0x41629c) {
        view.width = _0x54a346;
        view.height = _0x41629c;
      }
      const {
        devicePixelRatio
      } = window;
      const _0x2ddf06 = _0x54a346 * devicePixelRatio;
      const _0x5c3e17 = _0x41629c * devicePixelRatio;
      const _0x3b8c8f = Math.sqrt(_0x2ddf06 * _0x2ddf06 + _0x5c3e17 * _0x5c3e17) / Math.sqrt(2455780);
      const _0x2b1e55 = this.scale * _0x3b8c8f / devicePixelRatio;
      let vector;
      if (this.player) {
        vector = this.player.position;
        if (this.player.killer && this.config.followKiller) {
          vector = this.player.killer.position;
        }
      } else {
        vector = this.space.center;
      }
      if (this.origin && (!this.player || this.player.killer)) {
        const _0x12ca16 = this.origin.distance(vector);
        let _0x182a88 = _0x12ca16 / 30;
        const _0x4caab5 = vector.clone().sub(this.origin).normalize().mulScalar(_0x182a88);
        vector = this.origin.add(_0x4caab5);
      }
      this.origin = vector.clone();
      const _0x5010a6 = vector.x - _0x54a346 / 2 / _0x2b1e55;
      const _0x4fe2d2 = vector.x + _0x54a346 / 2 / _0x2b1e55;
      const _0x15266b = vector.y - _0x41629c / 2 / _0x2b1e55;
      const _0x29bcc8 = vector.y + _0x41629c / 2 / _0x2b1e55;
      const _0x4f0c46 = (point, _0x568ea6 = 0) => callback27(_0x5010a6 - _0x568ea6, _0x4fe2d2 + _0x568ea6, point.x) && callback27(_0x15266b - _0x568ea6, _0x29bcc8 + _0x568ea6, point.y);
      const _0x2a41b8 = (_0x49fb9c, _0x5af2d7 = 0) => callback28(_0x49fb9c.bounds.left - _0x5af2d7, _0x49fb9c.bounds.right + _0x5af2d7, _0x5010a6, _0x4fe2d2) > 0 && callback28(_0x49fb9c.bounds.top - _0x5af2d7, _0x49fb9c.bounds.bottom + _0x5af2d7, _0x15266b, _0x29bcc8) > 0;
      const callback95 = (_0x532992, _0x58c40d) => {
        const _0x3475d4 = 16 / 9;
        const _0x5e288c = 9 / 16;
        const _0x158e1e = callback25(_0x5e288c, _0x3475d4, _0x2ddf06 / _0x5c3e17);
        const _0x174801 = _0x532992 - _0x58c40d;
        const _0x5bf426 = _0x5e288c - _0x3475d4;
        const _0x531332 = -(_0x174801 * _0x3475d4 + _0x5bf426 * _0x532992);
        return -(_0x531332 + _0x174801 * _0x158e1e) / _0x5bf426;
      };
      const _0x11876d = ~~(callback95(20, 30) * _0x3b8c8f);
      const _0xf7a325 = this.config.platesStrokeWidth * _0x3b8c8f;
      const _0x163ec9 = ~~(_0x3b8c8f * 4);
      const _0x5052ae = _0x11876d + "px " + font;
      const _0x2809cc = ~~(_0x3b8c8f * 16);
      const _0x751269 = ~~(_0x11876d * 0.75);
      const _0x593bf3 = _0x751269 * 2;
      const _0x33d922 = ~~(_0x2ddf06 / callback95(4, 2.25));
      const _0x35ec6f = ~~(_0x33d922 / 2);
      return {
        game: this,
        view: view,
        ctx: context,
        viewWidth: _0x54a346,
        viewHeight: _0x41629c,
        devicePixelRatio: devicePixelRatio,
        scaler: _0x3b8c8f,
        scale: _0x2b1e55,
        origin: vector,
        pointInView: _0x4f0c46,
        boundsInView: _0x2a41b8,
        calcMult: callback95,
        viewScreenWidth: _0x2ddf06,
        viewScreenHeight: _0x5c3e17,
        fontSize: _0x11876d,
        strokeWidth: _0xf7a325,
        backHeight: _0x163ec9,
        uiFont: _0x5052ae,
        padding: _0x2809cc,
        barHeight: _0x593bf3,
        halfBarHeight: _0x751269,
        barWidth: _0x33d922,
        halfBarWidth: _0x35ec6f
      };
    }
    updateMetrics(_0x54d46a) {
      const {
        stats,
        timings
      } = this;
      const _0x646ac0 = {
        updateTime: timings.updateEndTime - timings.updateStartTime,
        renderTime: timings.renderEndTime - timings.renderStartTime,
        frameTime: _0x54d46a,
        events: this.events
      };
      this.metrics.push(_0x646ac0);
      if (this.metrics.length > _0xd09b08) {
        this.metrics.shift();
      }
      const _0x29318d = 0.05;
      stats.fps = callback23(stats.fps, 1000 / _0x54d46a, _0x29318d);
      stats.ut = callback23(stats.ut, timings.updateEndTime - timings.updateStartTime, _0x29318d);
      stats.ait = callback23(stats.ait, timings.aiEndTime - timings.aiStartTime, _0x29318d);
      stats.st = callback23(stats.st, timings.spawnEndTime - timings.spawnStartTime, _0x29318d);
      stats.rt = callback23(stats.rt, timings.renderEndTime - timings.renderStartTime, _0x29318d);
      this.fpsSequence.push(stats.fps);
      const _0x2fbf93 = 25;
      const _0x48c44b = 35;
      const _0x2a54ee = 10;
      const _0x293934 = 120;
      const _0x3636ac = 0.5;
      if (this.fpsSequence.length > _0x293934) {
        this.fpsSequence.sort();
        const _0x535376 = this.fpsSequence[~~(_0x293934 / 2)];
        if (_0x535376 < _0x2fbf93) {
          this.quality -= 0.1;
        }
        if (_0x535376 < _0x2a54ee) {
          this.quality -= 0.1;
        }
        if (this.quality < _0x3636ac) {
          this.quality = _0x3636ac;
        }
        if (_0x535376 > _0x48c44b) {
          this.quality += 0.1;
        }
        if (this.quality > 1) {
          this.quality = 1;
        }
        const _0x3d8841 = Math.round(this.quality * 10);
        this.quality = _0x3d8841 / 10;
        if (_0x3d8841 < 10) {
          const _0x33b565 = "q" + _0x3d8841;
          if (this.qas[_0x33b565]) {
            this.qas[_0x33b565] = false;
            if (window.ga) {
              window.ga("send", "event", "fps", _0x33b565);
            }
          }
        }
        this.fpsSequence = [];
      }
      this.events = {
        returns: 0,
        kills: 0
      };
    }
    setLeaderboard(_0x3f96a5) {
      if (_0x3f96a5) {
        this.leaderboard = _0x3f96a5;
        this.changeShields();
      }
    }
    changeShields() {
      const {
        countries: leaderboard
      } = this.leaderboard;
      if (leaderboard) {
        const _0x52f233 = leaderboard[0] && leaderboard[0].country;
        const _0x129382 = leaderboard[1] && leaderboard[1].country;
        const _0xc01a3 = leaderboard[2] && leaderboard[2].country;
        this.units.forEach(_0x378c17 => {
          const _0x4b4cea = _0x378c17.skin.assets.find(_0xb96779 => _0xb96779.pool.name === "shields");
          const _0x18d38d = _0x378c17.skin.assets.find(_0x4fc423 => _0x4fc423.pool.name === "flags");
          if (_0x4b4cea && _0x18d38d) {
            let _0x43471a = "gray";
            switch (_0x18d38d.name) {
              case _0x52f233:
                _0x43471a = "gold";
                break;
              case _0x129382:
                _0x43471a = "silver";
                break;
              case _0xc01a3:
                _0x43471a = "bronze";
                break;
            }
            if (_0x4b4cea.name !== _0x43471a) {
              _0x378c17.skin.removeAsset(_0x4b4cea);
              if ("shieldSkinAssets" in this.skinManager) {
                _0x378c17.skin.addAsset(this.skinManager.shieldSkinAssets.get(_0x43471a));
              }
            }
          }
        });
      }
    }
    post() {
      var paper2_results = window.paper2_results;
      var scores = paper2_results.scores;
      function callback95() {
        return (navigator.languages && navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || "en").substr(0, 2).toUpperCase();
      }
      var _0x129a88 = {
        build: paper2_results.build || 0,
        player: window.playerId || 0,
        lng: callback95(),
        name: this.player.name,
        top: paper2_results.top || 0,
        persent: Math.round(paper2_results.score * 100),
        best: paper2_results.bestPercent && Math.round(paper2_results.bestPercent * 10000) || 0,
        time: Math.round(paper2_results.time / 1000),
        kills: paper2_results.kills,
        scores: {
          accumulator: scores && scores.accumulator || 0,
          kills: scores && scores.kills || 0
        },
        reason: paper2_results.reason || 0
      };
      function callback96(_0x47f4ae) {
        var _0x3e57e9 = "";
        for (var i2 = 0; i2 < _0x47f4ae.length; i2++) {
          var _0xa11e69 = _0x47f4ae.charCodeAt(i2);
          var _0x267820 = _0xa11e69 ^ 42;
          _0x3e57e9 = _0x3e57e9 + String.fromCharCode(_0x267820);
        }
        return _0x3e57e9;
      }
      fetch("/newpaperio/ajax/results.php", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: callback96(escape(JSON.stringify(_0x129a88)))
      });
    }
    addCity(unit) {
      const name = unit.skin.assets.find(_0x143298 => _0x143298.pool.name === "flags").name;
      const city = new City(this.citiesManager.get(name), false, unit.position.clone(), unit);
      if (this.skinManager.isFlagSkinManager) {
        const _0x5ceed0 = this.skinManager.getCitySkin(name);
        city.skin = _0x5ceed0;
      }
      unit.cities.push(city);
    }
    checkSegments(_0x4d4a5b) {
      let _0x136bc7 = 0;
      this.units.forEach(unit => {
        _0x136bc7 += unit.base.polygon.segments.length;
        _0x136bc7 += unit.track.polyline.segments.length;
      });
      const _0x33065f = this.space.segmentsCount();
      const length = Object.keys(_0x33065f).length;
    }
    handleReturn(unit) {
      if (unit.death) {
        return;
      }
      this.events.returns++;
      const polyline = unit.track.polyline.clone();
      const {
        base: unit2
      } = unit;
      const _0x31a5aa = unit2.polygon.segments.findIndex(_0x1e052a => _0x1e052a.start === polyline.start);
      const _0x1d7cbf = unit2.polygon.segments.findIndex(_0x5e2821 => _0x5e2821.start === polyline.end);
      const _0x4ffa2b = Math.min(_0x1d7cbf, _0x31a5aa);
      const _0x490c91 = Math.max(_0x1d7cbf, _0x31a5aa);
      if (_0x4ffa2b !== _0x31a5aa) {
        polyline.reverse();
      }
      const _0x5a7e19 = polyline.points();
      const polygon = unit2.polygon.points();
      const list4 = polygon.splice(_0x4ffa2b, _0x490c91 - _0x4ffa2b + 1, ..._0x5a7e19);
      list4.shift();
      list4.pop();
      list4.reverse();
      list4.push(..._0x5a7e19);
      const polygon2 = new Polygon(list4);
      let polygon3;
      if (polygon2.rawSquare() < 0) {
        polygon3 = new Polygon(polygon.reverse());
        unit2.polygon.unsplice(polyline, _0x4ffa2b, _0x490c91);
      } else {
        polygon3 = polygon2;
        unit2.polygon.splice(polyline, _0x4ffa2b, _0x490c91);
      }
      unit2.square += polygon3.square();
      unit2.polygon.calcPath();
      this.units.filter(_0x299d30 => _0x299d30 !== unit).forEach(unit3 => {
        if (!unit3.death) {
          if (unit3.in === unit3.base && polygon3.inside(unit3.position)) {
            this.kill(unit3, unit, _0x17fe5b);
          }
          if (unit3.track.polyline.start && polygon3.inside(unit3.track.polyline.start)) {
            this.kill(unit3, unit, _0x52fd24);
          }
          if (unit3.cities && unit3.cities[0] && polygon3.inside(unit3.cities[0].position)) {
            this.kill(unit3, unit, _0x3bad23);
          }
        }
      });
      let list5 = [];
      const segments = unit.track.polyline.segments;
      const length = segments.length;
      const list6 = [];
      for (let i2 = 0; i2 <= length; i2++) {
        const _0x578435 = i2 === length ? segments[i2 - 1].end : segments[i2].start;
        const _0x45d654 = _0x578435.segments.filter(segment => segment.shape.owner !== unit.track && segment.shape.owner !== unit.base && segment.start === _0x578435);
        if (_0x45d654.length) {
          let list7 = _0x45d654.map(_0x3ea75c => ({
            owner: _0x3ea75c.shape.owner,
            point: _0x578435,
            segment: _0x3ea75c,
            index: i2
          }));
          if (!list5.length) {
            const _0xedaebe = unit.track.intersections.find(_0x540afd => _0x540afd.point.equal(_0x578435));
            if (!_0xedaebe) {
              return false;
            }
            list5 = list7.filter(_0x2d8e62 => {
              const list8 = _0xedaebe.intersections.filter(_0x35c9f5 => _0x35c9f5.base === _0x2d8e62.owner);
              if (!list8.length) {
                return false;
              }
              return list8[list8.length - 1].enter;
            });
          } else {
            let list8 = list5.filter(_0x2058ce => list7.some(_0x3c590e => {
              return _0x3c590e.owner === _0x2058ce.owner;
            }));
            if (list8.length) {
              const _0x12a6a7 = list8[0];
              const _0x1398d6 = list7.find(_0x519029 => _0x519029.owner === _0x12a6a7.owner);
              const callback95 = _0x125dfc => {
                const {
                  owner,
                  startT,
                  endT,
                  startPoint,
                  endPoint
                } = _0x125dfc;
                let {
                  enter,
                  leave
                } = _0x125dfc;
                if (enter.shape !== owner.polygon) {
                  enter = owner.polygon.segments.find(_0x4cf664 => _0x4cf664.start === startPoint);
                }
                if (leave.shape !== owner.polygon) {
                  leave = owner.polygon.segments.find(_0x5d714c => _0x5d714c.start === endPoint);
                }
                if (enter === leave) {
                  return;
                }
                const _0x5455c7 = unit.track.polyline.points().splice(startT, endT - startT + 1);
                const _0x2cdd7b = owner.polygon.segments.findIndex(_0x22e7a7 => _0x22e7a7 === enter);
                const _0xd94c2f = owner.polygon.segments.findIndex(_0x282134 => _0x282134 === leave);
                const _0x53cd50 = Math.min(_0xd94c2f, _0x2cdd7b);
                const _0x517d46 = Math.max(_0xd94c2f, _0x2cdd7b);
                if (_0x53cd50 !== _0x2cdd7b) {
                  _0x5455c7.reverse();
                }
                const list10 = owner.polygon.points();
                const list11 = list10.splice(_0x53cd50, _0x517d46 - _0x53cd50 + 1, ..._0x5455c7);
                list11.shift();
                list11.pop();
                list11.push(..._0x5455c7.slice().reverse());
                const polygon4 = new Polygon(list11);
                const polygon5 = new Polygon(list10);
                let polygon6;
                if (owner.unit.in === owner.unit.base && polygon4.inside(owner.unit.position) || owner.unit.in !== owner.unit.base && polygon4.inside(owner.unit.track.polyline.start)) {
                  owner.polygon.right(_0x5455c7, _0x53cd50, _0x517d46);
                  polygon6 = polygon5;
                } else {
                  owner.polygon.left(_0x5455c7, _0x53cd50, _0x517d46);
                  polygon6 = polygon4;
                }
                owner.square -= polygon6.square();
                owner.polygon.calcPath();
                list6.push({
                  base: owner,
                  poly: polygon6
                });
                this.units.forEach(unit3 => {
                  if (owner.unit !== unit3 && unit3.in === owner && polygon6.inside(unit3.position)) {
                    unit3.in = null;
                  }
                });
              };
              if (!(_0x12a6a7.owner instanceof Territory)) {
                throw new Error("Это не база");
              }
              callback95({
                owner: _0x12a6a7.owner,
                enter: _0x12a6a7.segment,
                startPoint: _0x12a6a7.point,
                startT: _0x12a6a7.index,
                leave: _0x1398d6.segment,
                endPoint: _0x1398d6.point,
                endT: _0x1398d6.index
              });
              const _0x56c2b6 = unit.track.intersections.find(_0xd06444 => _0xd06444.point.equal(_0x578435));
              const list9 = _0x56c2b6.intersections.filter(_0x2ead1e => _0x2ead1e.base === _0x12a6a7.owner);
              if (list9.length === 1 || list9[list9.length - 1].enter === false) {
                list7 = list7.filter(_0x3f554c => _0x3f554c.owner !== _0x12a6a7.owner);
              }
            }
            list5 = list7;
          }
        }
      }
      this.units.forEach(unit3 => {
        if (unit !== unit3 && polygon3.inside(unit3.position)) {
          unit3.in = unit.base;
        }
      });
      const _0x41364a = (unit.base.square - unit.lastSquare) / this.square;
      if (unit.schemes) {
        unit.schemes.comeback({
          increment: _0x41364a,
          rise: polygon3,
          victims: list6,
          game: this
        });
      }
    }
    render() {
      if (this.renderer) {
        this.renderer(this);
      }
    }
    handleUnitMovements(_0x447345) {
      this.units.slice().forEach(unit => {
        if (unit.death) {
          return;
        }
        let list4 = this.getMovement(_0x447345, unit);
        {
          if (unit === this.player && !this.player.moveTo && unit.in === null && Math.random() < 0.0005) {
            unit.in = unit.base;
          }
        }
        while (list4.length) {
          if (unit.death) {
            return;
          }
          const _0x568c14 = list4.shift();
          const list5 = this.space.intersections(_0x568c14);
          const list6 = [];
          list5.forEach(_0x510da2 => {
            const _0x51c4f2 = list6.findIndex(_0x5824d1 => _0x5824d1.point.equal(_0x510da2.point));
            if (_0x51c4f2 === -1) {
              list6.push({
                point: _0x510da2.point,
                intersections: [_0x510da2]
              });
            } else {
              if (_0x510da2.point !== list6[_0x51c4f2].point) {
                if (_0x510da2.point.cell) {
                  if (list6[_0x51c4f2].point.cell) {
                    throw new Error("Бывает ли такое?");
                  } else {
                    list6[_0x51c4f2].point = _0x510da2.point;
                    list6[_0x51c4f2].intersections.forEach(_0x1fa896 => {
                      _0x1fa896.point = _0x510da2.point;
                    });
                  }
                } else {
                  _0x510da2.point = list6[_0x51c4f2].point;
                }
              }
              list6[_0x51c4f2].intersections.push(_0x510da2);
            }
          });
          list5.forEach(_0x5c54f2 => {
            _0x5c54f2.distance = _0x568c14.start.distance2(_0x5c54f2.point);
          });
          list5.sort((_0x438257, _0x4e0f7c) => _0x438257.distance - _0x4e0f7c.distance);
          const list7 = [];
          let list8 = null;
          let _0x3bea17 = -1;
          list5.forEach(_0x5b060f => {
            if (!callback22(_0x5b060f.distance, _0x3bea17)) {
              list8 = [];
              _0x3bea17 = _0x5b060f.distance;
              list7.push(list8);
            }
            list8.push(_0x5b060f);
          });
          list7.forEach(list9 => {
            const list10 = [];
            list9.forEach(_0x45b190 => {
              const {
                shape
              } = _0x45b190.segment;
              if (shape && list10.indexOf(shape) === -1) {
                list10.push(shape);
              }
            });
            while (list10.length) {
              const _0x2f9419 = list10.findIndex(_0x5794f1 => _0x5794f1.owner === unit.in);
              if (_0x2f9419 > 0) {
                const _0x277c6a = list10[0];
                list10[0] = list10[_0x2f9419];
                list10[_0x2f9419] = _0x277c6a;
              }
              const _0x444fd5 = list10.findIndex(_0x358f9e => _0x358f9e.owner.isTrack);
              if (_0x444fd5 > 0) {
                const _0x88019d = list10[0];
                list10[0] = list10[_0x444fd5];
                list10[_0x444fd5] = _0x88019d;
              }
              const _0xc50a80 = list10.shift();
              const list11 = [];
              list9.forEach(_0x251f9e => {
                if (_0x251f9e.segment.shape === _0xc50a80) {
                  list11.push(_0x251f9e);
                }
              });
              while (!unit.death && list11.length) {
                list11.sort((_0x3064c0, _0xfe533b) => {
                  if (unit.in) {
                    return _0xfe533b.zn - _0x3064c0.zn;
                  } else {
                    return _0x3064c0.zn - _0xfe533b.zn;
                  }
                });
                const _0x213f86 = list11.shift();
                if (_0x213f86.segment.shape && !_0xc50a80.owner.unit.death) {
                  _0xc50a80.owner.handleIntersect(_0x213f86, unit, _0x568c14);
                }
              }
            }
          });
          if (unit.death) {
            return;
          }
          const {
            end
          } = _0x568c14;
          if (unit.in !== unit.base) {
            unit.track.add(end);
          }
          unit.position = end;
          if (this.visible && !list4.length && unit.in && unit.in !== unit.base) {
            let _0x1d0ff0 = Particle.nom(unit, _0x568c14, this.config.trackWidth);
            this.particles.push(_0x1d0ff0);
          }
        }
      });
    }
    isPlayer(_0x5b5dbb) {
      return _0x5b5dbb === this.player;
    }
    alert(_0x4754e6, _0x29a9fa) {
      this.labels.push(new TextParticle(_0x4754e6, _0x29a9fa || "#000000", this.player));
    }
    loop() {
      let _0x1b907b = now();
      if (this.stopped) {
        return;
      }
      if (!this.debugView && (this.visible || this.cycle < this.config.prepareCounter)) {
        this.looped = true;
        if (this.last == 0) {
          this.last = _0x1b907b;
        }
        let _0x176147 = _0x1b907b - this.last;
        if (_0x176147 < 1) {
          _0x176147 = 1;
        }
        this.updateMetrics(_0x176147);
        if (_0x176147 > 10000) {
          _0x176147 = 10000;
        }
        this.timings.updateStartTime = now();
        if (this.replaying || this.recording) {
          if (this.cycle < this.config.prepareCounter + 120 && _0x176147 > 100) {
            _0x176147 = 100;
          }
          if (_0x176147 > _0x4eb235 * 0.9 && _0x176147 < _0x4eb235 * 1.1) {
            _0x176147 = _0x4eb235;
          }
          this.timeAccumulated += _0x176147;
          if (this.preparing()) {
            this.prepareAndUpdate(_0x4eb235);
            this.timeAccumulated = 0;
          } else if (this.replaying && this.replaying.skip && this.replaying.skipping()) {
            let prepareAcceleration = this.config.prepareAcceleration;
            while (this.replaying && this.replaying.skipping() && prepareAcceleration-- > 0) {
              this.update(_0x4eb235);
            }
            this.timeAccumulated = 0;
          } else {
            if (this.timeAccumulated > _0x4eb235 * 10) {
              this.timeAccumulated = _0x4eb235 * 10;
            }
            while (this.timeAccumulated >= _0x4eb235) {
              this.timeAccumulated -= _0x4eb235;
              this.update(_0x4eb235);
            }
          }
        } else if (this.visible) {
          const _0x512f79 = _0x4eb235 * 2;
          while (_0x176147 > 0) {
            const _0x1d3150 = _0x176147 <= _0x512f79 ? _0x176147 : _0x176147 < _0x512f79 * 2 ? _0x176147 / 2 + Math.random() : _0x512f79 + Math.random();
            this.update(_0x1d3150);
            _0x176147 -= _0x1d3150;
          }
        } else {
          this.prepareAndUpdate(_0x176147);
        }
        this.timings.updateEndTime = now();
      }
      this.timings.renderStartTime = now();
      if (this.visible) {
        this.render();
      }
      this.timings.renderEndTime = now();
      this.last = _0x1b907b;
      requestAnimationFrame(_0x56970d => this.loop());
    }
  }
  class KeyboardModeSwitch {
    constructor() {
      this.mode2 = false;
    }
    get() {
      return this.mode2;
    }
    switch() {}
  }
  class Controller {
    constructor(element, _0x59dd4f) {
      this.up = false;
      this.down = false;
      this.left = false;
      this.right = false;
      this.modifiers = {
        shift: false,
        ctrl: false,
        alt: false,
        meta: false
      };
      this.mouse = null;
      this.lastMouse = null;
      this.buttons = {
        left: false,
        middle: false,
        right: false
      };
      this.codes = [];
      this.sets = [];
      this.keyboardModeSwitch = _0x59dd4f;
      this.pressedButtons = [];
      const _0x45f58d = _0x18168e => this.onKeyChange(_0x18168e, true);
      const _0x5b7c33 = _0x11a6d8 => this.onKeyChange(_0x11a6d8, false);
      if (_0x59dd4f) {
        _0x59dd4f.get();
        window.addEventListener("keydown", _0x45f58d, false);
        window.addEventListener("keyup", _0x5b7c33, false);
      }
      const _0x285b73 = event => event.preventDefault();
      element.addEventListener("contextmenu", _0x285b73, false);
      const _0x5aba7e = _0x5d0f61 => this.onMouseChange(_0x5d0f61, true);
      const _0x48778e = _0x2c9dbd => this.onMouseChange(_0x2c9dbd, false);
      const _0x36c59b = event => {
        this.lastMouse = this.mouse;
        this.mouse = null;
        event.preventDefault();
      };
      const callback95 = event => {
        if (this.mouse === null) {
          this.mouse = {};
        }
        this.mouse.x = event.pageX;
        this.mouse.y = event.pageY;
        event.preventDefault();
      };
      const _0x14f737 = event => {
        callback95(event);
        const {
          buttons
        } = event;
        this.buttons = {
          left: !!(buttons & 1),
          middle: !!(buttons & 4),
          right: !!(buttons & 2)
        };
        event.preventDefault();
      };
      element.addEventListener("mouseenter", _0x14f737, false);
      element.addEventListener("mousemove", callback95, false);
      element.addEventListener("mouseleave", _0x36c59b, false);
      element.addEventListener("mousedown", _0x5aba7e, false);
      element.addEventListener("mouseup", _0x48778e, false);
      const _0x3f4b7e = event => {
        this.lastMouse = this.mouse;
        this.mouse = null;
        event.preventDefault();
      };
      const _0x137951 = event => {
        if (this.mouse === null) {
          this.mouse = {};
        }
        const event2 = event.changedTouches[0];
        this.mouse.x = event2.clientX;
        this.mouse.y = event2.clientY;
        event.preventDefault();
      };
      element.addEventListener("touchstart", _0x137951, false);
      element.addEventListener("touchmove", _0x137951, false);
      element.addEventListener("touchend", _0x3f4b7e, false);
      element.addEventListener("touchcancel", _0x3f4b7e, false);
      this.dispose = () => {
        element.removeEventListener("contextmenu", _0x285b73, false);
        if (_0x59dd4f) {
          window.removeEventListener("keydown", _0x45f58d, false);
          window.removeEventListener("keyup", _0x5b7c33, false);
        }
        element.removeEventListener("mouseenter", _0x14f737, false);
        element.removeEventListener("mousemove", callback95, false);
        element.removeEventListener("mouseleave", _0x36c59b, false);
        element.removeEventListener("mousedown", _0x5aba7e, false);
        element.removeEventListener("mouseup", _0x48778e, false);
      };
    }
    pressed() {
      return this.up || this.down || this.left || this.right;
    }
    onKeyChange(event, _0x3a848e) {
      if (event.target === document.body) {
        let _0x10b4f0 = true;
        const {
          keyCode
        } = event;
        const _0x345f4b = this.pressedButtons.indexOf(keyCode);
        if (_0x3a848e) {
          if (_0x345f4b < 0) {
            this.pressedButtons.push(keyCode);
          }
          const _0x571d90 = this.sets.find(_0xd14c24 => _0xd14c24.codes.every(_0x71b23e => this.pressedButtons.find(_0x457bd4 => _0x457bd4 === _0x71b23e)));
          if (_0x571d90) {
            _0x571d90.handler();
          }
        } else {
          if (_0x345f4b >= 0) {
            this.pressedButtons.splice(_0x345f4b, 1);
          }
          const _0x46ae60 = this.codes.find(_0x43cfd2 => _0x43cfd2.code === keyCode);
          if (_0x46ae60) {
            _0x46ae60.handler();
          }
        }
        switch (keyCode) {
          case 38:
          case 87:
            this.up = _0x3a848e;
            break;
          case 40:
          case 83:
            this.down = _0x3a848e;
            break;
          case 37:
          case 65:
            this.left = _0x3a848e;
            break;
          case 39:
          case 68:
            this.right = _0x3a848e;
            break;
          case 67:
            if (!_0x3a848e) {
              this.keyboardModeSwitch.switch();
            }
            break;
          default:
            _0x10b4f0 = false;
            break;
        }
        this.modifiers.shift = event.shiftKey;
        this.modifiers.ctrl = event.ctrlKey;
        this.modifiers.alt = event.altKey;
        this.modifiers.meta = event.metaKey;
        if (_0x10b4f0) {
          event.preventDefault();
        }
      }
    }
    onMouseChange(event, _0xfc9f32) {
      switch (event.button) {
        case 0:
          this.buttons.left = _0xfc9f32;
          break;
        case 1:
          this.buttons.middle = _0xfc9f32;
          break;
        case 2:
          this.buttons.right = _0xfc9f32;
          break;
      }
    }
    addButton(_0x3af9c9, _0x25ce8f) {
      this.codes.push({
        code: _0x3af9c9,
        handler: _0x25ce8f
      });
    }
    addSet(_0x24bcaa, _0x4c1a93) {
      this.sets.push({
        codes: _0x24bcaa.sort(),
        handler: _0x4c1a93
      });
    }
  }
  var assign2 = Object.assign;
  class SkinLayer {
    constructor(_0x46ac87, _0x3a27c4, callback95) {
      this.level = 0;
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.direction = "";
      this.rotation = 0;
      this.url = "";
      this.src = null;
      this.image = null;
      this.config = _0x46ac87;
      Object.assign(this, _0x3a27c4);
      this.pivot = Object.assign({
        x: 0.5,
        y: 0.5
      }, _0x3a27c4.pivot);
      let _0x477016 = this.url ? callback40(this.url) : this.src ? Promise.resolve(this.src) : null;
      if (_0x477016) {
        _0x477016.then(_0x2df485 => {
          this.src = _0x2df485;
          this.rescale(1);
          if (callback95) {
            callback95(this);
          }
        });
      }
    }
    rescale(_0x2de62b) {
      const {
        trackWidth,
        maxScale
      } = this.config;
      const _0x20f488 = trackWidth * maxScale;
      const src = this.src;
      const _0x7c46da = src.naturalWidth || src.width;
      const _0x5794f4 = src.naturalHeight || src.height;
      const _0x2dc538 = _0x20f488 * _0x2de62b * this.scale / _0x7c46da;
      const _0x1c07b1 = ~~(_0x7c46da * _0x2dc538);
      const _0x306f8b = ~~(_0x5794f4 * _0x2dc538);
      const _0x20a4ae = _0x1c07b1 / _0x7c46da;
      const _0x145a85 = _0x306f8b / _0x5794f4;
      const element = document.createElement("canvas");
      element.width = _0x1c07b1;
      element.height = _0x306f8b;
      const context = element.getContext("2d");
      context.scale(_0x20a4ae, _0x145a85);
      context.drawImage(src, 0, 0);
      this.image = element;
    }
  }
  let _0x486b34;
  class PatternAsset {
    constructor(_0x28e464, canvas, _0x4c8ad3, _0x591234 = {}, callback95) {
      this.url = _0x4c8ad3 + _0x591234.url;
      this.scale = _0x591234.scale || 1;
      this.src = null;
      this.ready = false;
      const {
        maxScale
      } = _0x28e464;
      callback40(this.url).then(spatialGrid2 => {
        this.src = spatialGrid2;
        const _0x2a57f3 = ~~(spatialGrid2.naturalWidth || spatialGrid2.width);
        const _0xd536fd = ~~(spatialGrid2.naturalHeight || spatialGrid2.height);
        const _0x394a8d = maxScale * 100 * this.scale / _0x2a57f3;
        if (_0x2a57f3 == 0) {
          console.log(this.url + " has no width");
        }
        if (_0xd536fd == 0) {
          console.log(this.url + " has no heigth");
        }
        const _0x1e3321 = Math.floor(_0x2a57f3 * _0x394a8d) || 1;
        const _0x50e221 = Math.floor(_0xd536fd * _0x394a8d) || 1;
        const element = document.createElement("canvas");
        element.width = _0x1e3321;
        element.height = _0x50e221;
        element.getContext("2d").drawImage(spatialGrid2, 0, 0, _0x1e3321 + 1, _0x50e221 + 1);
        this.pattern = canvas.getContext("2d").createPattern(element, "repeat");
        const _0x3fc465 = 1 / maxScale;
        if (!_0x486b34) {
          _0x486b34 = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        }
        const _0x146217 = _0x486b34.createSVGMatrix().scale(_0x3fc465, _0x3fc465);
        if (this.pattern.setTransform) {
          this.pattern.setTransform(_0x146217);
        }
        this.ready = true;
        if (callback95) {
          callback95();
        }
      });
    }
  }
  class Avatar {
    constructor(_0x527bba, _0x31671a, _0x3b76ff, callback95) {
      this.layers = [];
      this.scale = 1;
      this.x = 0;
      this.y = 0;
      this.ready = false;
      Object.assign(this, _0x3b76ff);
      let i2 = 0;
      const _0x41860f = _0x5c5381 => {
        _0x5c5381.rescale(this.scale);
        if (this.layers.length === ++i2) {
          this.ready = true;
          if (callback95) {
            callback95();
          }
        }
      };
      this.layers = (this.layers || []).map(_0x1c9aca => new SkinLayer(_0x527bba, assign2(assign2({}, _0x1c9aca), {
        url: _0x1c9aca.url && "" + _0x31671a + _0x1c9aca.url
      }), _0x41860f));
      this.frontLayers = this.layers.filter(_0x3c6c45 => _0x3c6c45.level >= 1).sort((_0x378c80, _0x1e8d58) => _0x378c80.level - _0x1e8d58.level);
      this.backLayers = this.layers.filter(_0x402036 => _0x402036.level < 1).sort((_0x559f43, _0x398898) => _0x398898.level - _0x559f43.level);
    }
  }
  class DisplayList {
    constructor() {
      this.displays = [];
      this.frontLayers = [];
      this.backLayers = [];
      this.maxScale = 0;
    }
    get ready() {
      return this.displays.every(_0x1f7eaf => _0x1f7eaf.ready);
    }
    sort() {
      this.frontLayers = [].concat(...this.displays.map(_0x50f5f0 => _0x50f5f0.frontLayers.map(_0x34bb48 => ({
        display: _0x50f5f0,
        layer: _0x34bb48
      })))).sort((_0x11c991, _0x5f3e93) => _0x11c991.layer.level - _0x5f3e93.layer.level);
      this.backLayers = [].concat(...this.displays.map(_0xc4fd77 => _0xc4fd77.backLayers.map(_0x306833 => ({
        display: _0xc4fd77,
        layer: _0x306833
      })))).sort((_0x3089ad, _0x1a32af) => _0x1a32af.layer.level - _0x3089ad.layer.level);
      this.maxScale = Math.max(...this.frontLayers.map(_0x1c6448 => _0x1c6448.display.scale * _0x1c6448.layer.scale));
    }
    add(_0x1bcc1a) {
      this.displays.push(_0x1bcc1a);
      this.sort();
    }
    remove(_0x4625c7) {
      this.displays = this.displays.filter(_0x1363be => _0x1363be !== _0x4625c7);
      this.sort();
    }
  }
  let _0x2d02fe;
  let _0x3ee25a;
  let _0x5fb03a;
  let _0x260d10;
  const callback50 = (_0x49fd17, spatialGrid2, _0x4bf92c, _0x505a64) => {
    if (_0x260d10 !== _0x49fd17 || _0x3ee25a !== _0x4bf92c || _0x5fb03a !== _0x505a64) {
      _0x2d02fe = _0x49fd17.createLinearGradient(spatialGrid2.width / 2, 0, spatialGrid2.width / 2, spatialGrid2.height);
      _0x2d02fe.addColorStop(0, _0x4bf92c);
      _0x2d02fe.addColorStop(1, _0x505a64);
    }
    return _0x2d02fe;
  };
  const callback51 = (_0x119795, _0x2a47f1, _0x5ec4ac, _0x22210a) => {
    _0x119795.strokeStyle = _0x5ec4ac;
    _0x119795.lineWidth = _0x22210a;
    _0x119795.stroke(_0x2a47f1);
  };
  const callback52 = (_0x44fed2, _0x2f469d, _0x3b505d, _0x32360d, _0x2aadea) => {
    if (_0x3b505d.polyline.segments.length) {
      _0x44fed2.lineWidth = _0x2aadea;
      _0x44fed2.strokeStyle = _0x2f469d;
      _0x44fed2.stroke(_0x3b505d.polyline.path);
    }
  };
  const callback53 = (_0x5cefb0, unit, _0x368644, _0x3483c0, _0x387563) => {
    const {
      devicePixelRatio
    } = window;
    const _0x206cf1 = _0x3483c0 * 24 / devicePixelRatio;
    const _0x42bf58 = _0x3483c0 * 4 / devicePixelRatio;
    _0x5cefb0.save();
    _0x5cefb0.translate(unit.position.x, unit.position.y);
    _0x5cefb0.scale(1.001 / _0x368644, 1.001 / _0x368644);
    _0x5cefb0.font = _0x206cf1 + "px " + _0x387563;
    _0x5cefb0.textAlign = "center";
    _0x5cefb0.textBaseline = "bottom";
    let name = unit.name;
    if (unit == unit.game.player) {
      if (new Date().getSeconds() % 2 == 0) {
        if (unit.game.recording) {
          name = "Recording";
        } else if (unit.game.replaying) {
          name = "Replaying";
        }
      }
    }
    const _0x44a8ff = ~~(_0x368644 * -12);
    const _0x5b98dc = "#363331";
    _0x5cefb0.lineWidth = _0x42bf58 / 4;
    _0x5cefb0.strokeStyle = _0x5b98dc;
    _0x5cefb0.shadowColor = _0x5b98dc;
    _0x5cefb0.shadowBlur = _0x42bf58 / 2;
    _0x5cefb0.strokeText(name, 0, _0x44a8ff);
    _0x5cefb0.fillStyle = _0x5b98dc;
    _0x5cefb0.fillText(name, 2, _0x44a8ff + 2);
    let _0xdb172b = "#dddddd";
    const _0x55554a = unit.skin.assets.find(_0x3d0f3d => _0x3d0f3d.pool.name === "shields");
    if (_0x55554a) {
      _0xdb172b = _0x55554a.content.color;
    }
    _0x5cefb0.fillStyle = _0xdb172b;
    _0x5cefb0.shadowColor = _0xdb172b;
    _0x5cefb0.shadowBlur = _0x42bf58 / 3;
    _0x5cefb0.fillText(name, 0, _0x44a8ff);
    _0x5cefb0.restore();
  };
  const callback54 = () => {
    const path2D = new Path2D();
    const _0x488f86 = 5;
    path2D.moveTo(_0x488f86 * -3, _0x488f86 * -3);
    path2D.lineTo(_0x488f86 * -1, _0x488f86 * -1);
    path2D.lineTo(_0x488f86 * 0, _0x488f86 * -3);
    path2D.lineTo(_0x488f86 * 1, _0x488f86 * -1);
    path2D.lineTo(_0x488f86 * 3, _0x488f86 * -3);
    path2D.lineTo(_0x488f86 * 2, _0x488f86 * 1);
    path2D.lineTo(_0x488f86 * -2, _0x488f86 * 1);
    path2D.closePath();
    return path2D;
  };
  const _0x4f7610 = callback54();
  const callback55 = (_0x42bc0c, _0x1900f2, _0x11987d, _0x1b10c2) => {
    const {
      devicePixelRatio
    } = window;
    const _0xc0c8d6 = _0x1b10c2 * 24 / devicePixelRatio;
    _0x42bc0c.save();
    _0x42bc0c.translate(_0x1900f2.position.x, _0x1900f2.position.y);
    _0x42bc0c.scale(1 / (_0x11987d * devicePixelRatio), 1 / (_0x11987d * devicePixelRatio));
    _0x42bc0c.fillStyle = "#ffff00";
    _0x42bc0c.strokeStyle = "#ff8800";
    _0x42bc0c.lineJoin = "round";
    _0x42bc0c.lineWidth = 1;
    _0x42bc0c.translate(0, _0x11987d * -10 * devicePixelRatio);
    _0x42bc0c.translate(0, -_0xc0c8d6 * devicePixelRatio);
    _0x42bc0c.scale(_0x1b10c2, _0x1b10c2);
    _0x42bc0c.translate(0, -4);
    _0x42bc0c.translate(0, -12);
    _0x42bc0c.fill(_0x4f7610);
    _0x42bc0c.stroke(_0x4f7610);
    _0x42bc0c.restore();
  };
  const callback56 = () => {
    const path2D = new Path2D();
    const _0x325770 = 1.6;
    path2D.moveTo(_0x325770 * 0, _0x325770 * -7);
    path2D.lineTo(_0x325770 * 5, _0x325770 * -6);
    path2D.lineTo(_0x325770 * 7, _0x325770 * -3);
    path2D.lineTo(_0x325770 * 6, _0x325770 * 2);
    path2D.lineTo(_0x325770 * 4, _0x325770 * 3);
    path2D.lineTo(_0x325770 * 3, _0x325770 * 6);
    path2D.lineTo(_0x325770 * 0, _0x325770 * 7);
    path2D.lineTo(_0x325770 * -3, _0x325770 * 6);
    path2D.lineTo(_0x325770 * -4, _0x325770 * 3);
    path2D.lineTo(_0x325770 * -6, _0x325770 * 2);
    path2D.lineTo(_0x325770 * -7, _0x325770 * -3);
    path2D.lineTo(_0x325770 * -5, _0x325770 * -6);
    path2D.closePath();
    path2D.arc(_0x325770 * -3, _0x325770 * -1, _0x325770 * 2, 0, Math.PI * 2, true);
    path2D.closePath();
    path2D.arc(_0x325770 * 3, _0x325770 * -1, _0x325770 * 2, 0, Math.PI * 2, true);
    path2D.closePath();
    path2D.moveTo(_0x325770 * 0, _0x325770 * 1);
    path2D.lineTo(_0x325770 * -2, _0x325770 * 3);
    path2D.lineTo(_0x325770 * 0, _0x325770 * 4);
    path2D.lineTo(_0x325770 * 2, _0x325770 * 3);
    path2D.closePath();
    return path2D;
  };
  const _0x15282d = callback56();
  const callback57 = (_0x13722c, _0x101e7f, _0x11b8fa, _0x438e5d) => {
    _0x13722c.save();
    _0x13722c.fillStyle = "#ffffffcc";
    _0x13722c.translate(_0x101e7f, _0x11b8fa);
    _0x13722c.scale(_0x438e5d, _0x438e5d);
    _0x13722c.fill(_0x15282d);
    _0x13722c.restore();
  };
  const callback58 = (_0x372d3a, _0x308c06, unit, skinLayer, skinLayer2) => {
    const {
      trackWidth
    } = _0x372d3a;
    if (skinLayer2.image) {
      const _0x17dacd = skinLayer2.image.naturalWidth || skinLayer2.image.width;
      const _0x38be58 = skinLayer2.image.naturalHeight || skinLayer2.image.height;
      const _0x249d7a = trackWidth * skinLayer.scale * skinLayer2.scale / _0x17dacd;
      _0x308c06.save();
      _0x308c06.translate(unit.position.x, unit.position.y - _0x372d3a.baseHeight * skinLayer2.level);
      _0x308c06.rotate(unit.direction + Math.PI / 2);
      _0x308c06.translate((skinLayer.x + skinLayer2.x) * trackWidth, (skinLayer.y + skinLayer2.y) * trackWidth);
      let _0x26b1dd = 0;
      if (skinLayer2.direction === "target") {
        const point = (unit.target || new Vector(0, 0)).clone().sub(unit.position);
        const _0x34502f = Math.atan2(point.y, point.x);
        _0x26b1dd += _0x34502f - unit.direction;
      }
      if (skinLayer2.direction === "billboard") {
        _0x26b1dd += -unit.direction - Math.PI / 2;
      }
      if (skinLayer2.rotation) {
        _0x26b1dd += skinLayer2.rotation * 0.0174533;
      }
      if (_0x26b1dd) {
        _0x308c06.rotate(_0x26b1dd);
      }
      _0x308c06.scale(_0x249d7a, _0x249d7a);
      _0x308c06.translate(_0x17dacd * -skinLayer2.pivot.x, _0x38be58 * -skinLayer2.pivot.y);
      _0x308c06.drawImage(skinLayer2.image, 0, 0);
      _0x308c06.restore();
    }
  };
  const callback59 = (_0x43261e, _0x406770, _0x23533f, avatar, _0x453a0b) => {
    const list4 = _0x453a0b ? avatar.frontLayers : avatar.backLayers;
    list4.forEach(_0x1d609b => callback58(_0x43261e, _0x406770, _0x23533f, _0x1d609b.display, _0x1d609b.layer));
  };
  const callback60 = (_0x2a37fc, _0x579e56, _0x133664, _0x1f63be, _0x4f556f, _0x4e5701, _0x2c42ca) => {
    const [_0x41b7d4, _0x112984, _0x584a53, _0x1da05d] = _0x4e5701;
    _0x2a37fc.beginPath();
    _0x2a37fc.moveTo(_0x579e56 + _0x41b7d4, _0x133664);
    _0x2a37fc.lineTo(_0x579e56 + _0x1f63be - _0x112984, _0x133664);
    _0x2a37fc.quadraticCurveTo(_0x579e56 + _0x1f63be, _0x133664, _0x579e56 + _0x1f63be, _0x133664 + _0x112984);
    _0x2a37fc.lineTo(_0x579e56 + _0x1f63be, _0x133664 + _0x4f556f - _0x584a53);
    _0x2a37fc.quadraticCurveTo(_0x579e56 + _0x1f63be, _0x133664 + _0x4f556f, _0x579e56 + _0x1f63be - _0x584a53, _0x133664 + _0x4f556f);
    _0x2a37fc.lineTo(_0x579e56 + _0x1da05d, _0x133664 + _0x4f556f);
    _0x2a37fc.quadraticCurveTo(_0x579e56, _0x133664 + _0x4f556f, _0x579e56, _0x133664 + _0x4f556f - _0x1da05d);
    _0x2a37fc.lineTo(_0x579e56, _0x133664 + _0x41b7d4);
    _0x2a37fc.quadraticCurveTo(_0x579e56, _0x133664, _0x579e56 + _0x41b7d4, _0x133664);
    _0x2a37fc.closePath();
    _0x2a37fc.fill();
    if (_0x2c42ca) {
      _0x2a37fc.strokeStyle = "#00000099";
      _0x2a37fc.lineWidth = _0x2c42ca;
      _0x2a37fc.stroke();
    }
  };
  const callback61 = (_0x1b3b11, _0x320560, _0xee4d43) => {
    _0x1b3b11.fillStyle = _0xee4d43;
    _0x1b3b11.fill(_0x320560);
  };
  const callback62 = _0x31b46f => {
    const {
      game: game,
      ctx,
      boundsInView
    } = _0x31b46f;
    const {
      trackWidth
    } = game.config;
    game.units.forEach(unit => {
      if (boundsInView(unit.base.polygon, trackWidth) || game.debugView) {
        callback61(ctx, unit.base.polygon.path, unit.skin.pattern && unit.skin.pattern.pattern || unit.skin.colors.main);
      }
    });
  };
  const callback63 = _0x2a64c3 => {
    const {
      game: game,
      ctx,
      boundsInView
    } = _0x2a64c3;
    const {
      trackWidth
    } = game.config;
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "destination-out";
    game.units.forEach(unit => {
      const {
        start
      } = unit.track.polyline;
      if (start) {
        if (boundsInView(unit.track.polyline, trackWidth)) {
          callback52(ctx, unit.skin.colors.main, unit.track, unit.position, trackWidth);
          ctx.save();
          ctx.globalCompositeOperation = "destination-over";
          ctx.clip(unit.base.polygon.path);
          callback52(ctx, unit.skin.pattern && unit.skin.pattern.pattern || unit.skin.colors.main, unit.track, unit.position, trackWidth + 2);
          ctx.restore();
        }
      }
    });
    ctx.restore();
  };
  const callback64 = _0x2d1858 => {
    const {
      game: game,
      ctx,
      pointInView
    } = _0x2d1858;
    const {
      trackWidth
    } = game.config;
    game.units.forEach(city => {
      if (pointInView(city.position, trackWidth * 4)) {
        callback59(game.config, ctx, city, city.skin.container, true);
      }
    });
  };
  const callback65 = _0x4c7858 => {
    const {
      game: game,
      ctx,
      scale,
      scaler,
      pointInView
    } = _0x4c7858;
    const {
      trackWidth,
      font
    } = game.config;
    game.units.forEach(_0x14c7b6 => {
      if (pointInView(_0x14c7b6.position, trackWidth * 20) || game.debugView) {
        callback53(ctx, _0x14c7b6, scale, scaler, font);
      }
    });
  };
  const callback66 = _0x185369 => {
    const {
      game: game,
      ctx,
      pointInView
    } = _0x185369;
    const {
      trackWidth
    } = game.config;
    game.units.forEach(city => {
      if (pointInView(city.position, trackWidth * 4)) {
        callback59(game.config, ctx, city, city.skin.container, false);
      }
    });
  };
  const callback67 = _0x1cb993 => {
    const {
      game: game,
      ctx,
      boundsInView
    } = _0x1cb993;
    const {
      trackWidth
    } = game.config;
    ctx.save();
    ctx.lineCap = "round";
    ctx.globalAlpha = 0.6;
    game.units.forEach(unit => {
      if (unit.in !== unit.base) {
        if (boundsInView(unit.track.polyline, trackWidth)) {
          callback52(ctx, game.tailRecovered && unit == game.player ? "#f00" : unit.skin.colors.main, unit.track, unit.position, trackWidth);
        }
      }
    });
    ctx.restore();
  };
  const callback68 = _0x5cc45b => {
    const {
      game: game,
      ctx,
      boundsInView
    } = _0x5cc45b;
    const {
      trackWidth
    } = game.config;
    game.units.forEach(unit => {
      if (boundsInView(unit.base.polygon, trackWidth)) {
        callback61(ctx, unit.base.polygon.path, unit.skin.colors.back);
      }
    });
  };
  const callback69 = _0x4ee22c => {
    const {
      game: game,
      ctx,
      viewScreenWidth,
      viewScreenHeight
    } = _0x4ee22c;
    const {
      baseHeight,
      arenaColor,
      borderColor,
      backgroundTopColor,
      backgroundBottomColor
    } = game.config;
    callback61(ctx, game.border.polygon.path, arenaColor);
    ctx.translate(0, baseHeight * 3);
    callback61(ctx, game.border.polygon.path, borderColor);
    ctx.translate(0, baseHeight * -3);
    ctx.fillStyle = callback50(ctx, game.space, backgroundTopColor, backgroundBottomColor);
    ctx.fillRect(viewScreenWidth / -2, viewScreenHeight / -2, game.space.width + viewScreenWidth, game.space.height + viewScreenHeight);
  };
  const callback70 = _0x39ac62 => {
    const {
      game: game,
      ctx,
      pointInView
    } = _0x39ac62;
    const {
      trackWidth
    } = game.config;
    ctx.save();
    game.particles.forEach(particle => particle.time > 0 && pointInView(particle.position, trackWidth) && particle.draw(ctx));
    ctx.restore();
  };
  const callback71 = _0x37f67c => {
    const {
      game: _0x5c7f96,
      ctx,
      scale,
      scaler
    } = _0x37f67c;
    const {
      font
    } = _0x5c7f96.config;
    ctx.scale(1 / scale, 1 / scale);
    _0x5c7f96.labels.forEach(_0x2c8f54 => _0x2c8f54.draw(ctx, font, scale, scaler));
    ctx.scale(scale, scale);
  };
  const callback72 = _0x4ca7e3 => {
    const {
      game: _0x2f39aa,
      ctx,
      scale,
      scaler
    } = _0x4ca7e3;
    const _0x16762d = _0x2f39aa.units[0];
    if (_0x16762d) {
      callback55(ctx, _0x16762d, scale, scaler);
    }
  };
  const callback73 = _0x4757de => {
    const {
      game: game,
      ctx,
      scaler,
      calcMult,
      viewScreenWidth,
      viewScreenHeight,
      padding
    } = _0x4757de;
    const _0x2014d4 = viewScreenWidth / calcMult(8, 3);
    const _0x32d074 = game.space.width / _0x2014d4 * scaler * 3;
    ctx.save();
    ctx.translate(viewScreenWidth - padding - _0x2014d4, viewScreenHeight - padding - _0x2014d4);
    ctx.scale(_0x2014d4 / game.space.width, _0x2014d4 / game.space.height);
    callback61(ctx, game.border.polygon.path, "#c2d6cdaa");
    callback61(ctx, game.player.base.polygon.path, game.player.skin.colors.main);
    callback51(ctx, game.player.base.polygon.path, game.player.skin.colors.back, _0x32d074 / 2);
    callback52(ctx, game.player.skin.colors.back, game.player.track, game.player.position, _0x32d074 / 2);
    const _0x39f846 = game.units.some(_0x1405a7 => !game.isPlayer(_0x1405a7) && _0x1405a7.in === game.player.base) ? "#ff0000" : "#00000099";
    callback51(ctx, game.border.polygon.path, _0x39f846, _0x32d074);
    ctx.beginPath();
    ctx.arc(game.player.position.x, game.player.position.y, _0x32d074, 0, Math.PI * 2);
    ctx.fillStyle = game.player.skin.colors.nick;
    ctx.fill();
    const _0x29633a = game.player.skin.assets.find(_0x381faa => _0x381faa.pool && _0x381faa.pool.name === "flags");
    const spatialGrid2 = _0x29633a && _0x29633a.content.roundedFlag;
    if (spatialGrid2 && game.player.cities) {
      game.player.cities.forEach(_0x30d699 => {
        ctx.save();
        ctx.translate(_0x30d699.position.x, _0x30d699.position.y);
        ctx.scale(2, 2);
        ctx.drawImage(spatialGrid2, -spatialGrid2.width / 2, -spatialGrid2.height / 2);
        ctx.restore();
      });
    }
    ctx.restore();
  };
  let spatialGrid;
  window.addEventListener("resize", () => spatialGrid = null, false);
  const callback74 = _0x2af210 => {
    let {
      ctx,
      devicePixelRatio
    } = _0x2af210;
    if (!spatialGrid) {
      spatialGrid = document.createElement("canvas");
      spatialGrid.width = ~~_0x2af210.barWidth;
      spatialGrid.height = ~~(_0x2af210.barHeight * 1.3 * 8);
    }
    if (_0x2af210.game.topListChanged) {
      _0x2af210.game.topListChanged = false;
      let context = spatialGrid.getContext("2d");
      context.save();
      context.clearRect(0, 0, spatialGrid.width, spatialGrid.height);
      context.translate(-ctx.canvas.width + spatialGrid.width, 0);
      context.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
      callback75(context, _0x2af210);
      context.restore();
    }
    ctx.save();
    ctx.resetTransform();
    ctx.drawImage(spatialGrid, ctx.canvas.width - spatialGrid.width, 0);
    ctx.restore();
  };
  const callback75 = (_0x3d450a, _0x3807c4) => {
    const {
      game: game,
      viewScreenWidth,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      barWidth,
      halfBarWidth,
      strokeWidth,
      uiFont
    } = _0x3807c4;
    let _0x1d74ae;
    const callback95 = (unit, _0x5a6511, _0x58801d, _0x315846) => {
      const _0x44c9e3 = padding + _0x58801d * (barHeight * 1.3);
      const _0x6268cd = unit.schemes.scores();
      let _0xfb2cb = halfBarWidth * (_0x6268cd / _0x315846);
      if (_0x1d74ae && _0xfb2cb > _0x1d74ae - halfBarWidth * 0.05) {
        _0xfb2cb = _0x1d74ae - halfBarWidth * 0.05;
      }
      _0x1d74ae = _0xfb2cb;
      const _0x3e1956 = halfBarWidth + _0xfb2cb;
      let _0x230083 = viewScreenWidth - _0x3e1956;
      const _0x1d053a = [halfBarHeight, 0, 0, halfBarHeight];
      _0x3d450a.fillStyle = "#00000022";
      callback60(_0x3d450a, _0x230083 + backHeight, _0x44c9e3 + backHeight * 3, barWidth, barHeight, _0x1d053a);
      _0x3d450a.fillStyle = unit.skin.colors.back;
      callback60(_0x3d450a, _0x230083, _0x44c9e3 + backHeight, barWidth, barHeight, _0x1d053a, strokeWidth);
      _0x3d450a.fillStyle = unit.skin.colors.main;
      callback60(_0x3d450a, _0x230083, _0x44c9e3, barWidth, barHeight, _0x1d053a, strokeWidth);
      const _0x4687a1 = unit.skin.assets.find(_0x3ae0b9 => _0x3ae0b9.pool && _0x3ae0b9.pool.name === "flags");
      const _0x419338 = _0x4687a1 && _0x4687a1.content.roundedFlag;
      if (_0x419338) {
        const _0x35878d = barHeight * 0.8;
        const _0x3275bc = barHeight / 4;
        const _0x8b74bb = _0x35878d / _0x419338.height;
        _0x3d450a.save();
        _0x3d450a.translate(_0x230083 + _0x3275bc, _0x44c9e3 + barHeight / 2);
        _0x3d450a.scale(_0x8b74bb, _0x8b74bb);
        _0x3d450a.drawImage(_0x419338, 0, -_0x419338.height / 2);
        _0x3d450a.restore();
        _0x230083 += _0x35878d;
      }
      _0x3d450a.fillStyle = unit.skin.colors.plate;
      _0x3d450a.font = uiFont;
      _0x3d450a.textAlign = "left";
      _0x3d450a.textBaseline = "middle";
      _0x3d450a.fillText(_0x5a6511 + " – " + unit.schemes.print() + " " + unit.name, _0x230083 + halfBarHeight, _0x44c9e3 + halfBarHeight * 1.1);
    };
    const _0x2be3d7 = game.units[0];
    const _0x1a5fbd = _0x2be3d7 && _0x2be3d7.schemes.scores();
    let _0xdb840e = false;
    for (let i2 = 0; i2 < 5; i2++) {
      const _0x47defe = game.units[i2];
      if (_0x47defe) {
        if (game.isPlayer(_0x47defe)) {
          _0xdb840e = true;
        }
        callback95(_0x47defe, i2 + 1, i2, _0x1a5fbd);
      }
    }
    if (!_0xdb840e && game.player && !game.player.death) {
      const _0x4cb172 = game.units.findIndex(_0x57bc8d => game.isPlayer(_0x57bc8d));
      callback95(game.player, _0x4cb172 + 1, 6, _0x1a5fbd);
    }
  };
  const callback76 = _0x210ba7 => {
    const {
      game: _0x59d5c0,
      ctx,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      barWidth,
      strokeWidth,
      uiFont
    } = _0x210ba7;
    const {
      player
    } = _0x59d5c0;
    ctx.fillStyle = "#00000022";
    callback60(ctx, 0, padding, barWidth, barHeight + backHeight, [0, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2, 0]);
    const _0x1fafd7 = _0x59d5c0.best ? Math.min(1, player.schemes.scores() / _0x59d5c0.best) : 1;
    const _0x225524 = barWidth * (0.25 + _0x1fafd7 * 0.75);
    ctx.fillStyle = player.skin.colors.back;
    callback60(ctx, 0, padding + backHeight, _0x225524, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
    ctx.fillStyle = player.skin.colors.main;
    callback60(ctx, 0, padding, _0x225524, barHeight, [0, halfBarHeight, halfBarHeight, 0], strokeWidth);
    ctx.fillStyle = player.skin.colors.plate;
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(player.schemes.print(), halfBarHeight, padding + halfBarHeight * 1.1);
  };
  const callback77 = _0x375967 => {
    const {
      game: game,
      ctx,
      padding,
      backHeight,
      barHeight,
      uiFont
    } = _0x375967;
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    let _0x2dad2d = game.language.bestTxt + " " + game.player.schemes.print(game.best);
    ctx.fillStyle = "#00000066";
    ctx.fillText(_0x2dad2d, padding / 2, padding + barHeight + backHeight + padding / 2);
  };
  const callback78 = _0x56620e => {
    const {
      game: _0x27f463,
      ctx,
      scaler,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      fontSize,
      uiFont
    } = _0x56620e;
    const _0x32c2d5 = padding + barHeight + backHeight + fontSize + padding / 2 + 4;
    ctx.font = uiFont;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let _0x5399bc = "x" + _0x27f463.player.statistics.kills;
    ctx.fillStyle = "#00000088";
    callback60(ctx, 0, _0x32c2d5, barHeight * 1.5 + ctx.measureText(_0x5399bc).width, barHeight, [0, halfBarHeight, halfBarHeight, 0]);
    callback57(ctx, barHeight * 1.4 / 2, _0x32c2d5 + barHeight / 2, scaler);
    ctx.fillStyle = "#ffffffcc";
    ctx.fillText(_0x5399bc, barHeight * 1.25, _0x32c2d5 + halfBarHeight + barHeight * 0.03);
  };
  const callback79 = _0x40826b => {
    const {
      game: _0x3c8895,
      ctx,
      scaler,
      padding,
      backHeight,
      barHeight,
      halfBarHeight,
      fontSize,
      uiFont,
      viewWidth,
      viewHeight,
      viewScreenWidth,
      viewScreenHeight
    } = _0x40826b;
    if (_0x3c8895.notifications.length) {
      const quest = _0x3c8895.notifications[0];
      if (quest.ready) {
        ctx.save();
        ctx.font = uiFont;
        const _0x22165c = fontSize * 2 + padding;
        const _0x51a913 = quest.position() * (_0x22165c + padding) - _0x22165c;
        const _0x4ed0dd = Math.max(ctx.measureText(quest.title).width, ctx.measureText(quest.description).width);
        const _0x38facc = fontSize * 2;
        const _0x547382 = _0x4ed0dd + padding * 5 + _0x38facc;
        const _0x475fa5 = padding / 2;
        ctx.fillStyle = "#00000088";
        callback60(ctx, (viewScreenWidth - _0x547382) / 2, _0x51a913, _0x547382, _0x22165c, [(barHeight + backHeight) / 2, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2, (barHeight + backHeight) / 2]);
        ctx.fillStyle = "#ffffff";
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 1;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(quest.title, (viewScreenWidth - _0x547382) / 2 + _0x547382 / 2 + _0x38facc / 2, _0x51a913 + _0x475fa5);
        ctx.fillStyle = "#ffffff88";
        ctx.shadowColor = "#ffffff88";
        ctx.shadowBlur = 1;
        ctx.font = uiFont;
        ctx.fillText(quest.description, (viewScreenWidth - _0x547382) / 2 + _0x547382 / 2 + _0x38facc / 2, _0x51a913 + _0x475fa5 + fontSize);
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 10;
        if (quest.image) {
          ctx.drawImage(quest.image, (viewScreenWidth - _0x547382) / 2 + _0x475fa5, _0x51a913 + _0x475fa5, _0x38facc, _0x38facc);
        }
        ctx.restore();
      }
    }
  };
  function _0x594216(game) {
    const _0x44f555 = game.getRenderContext();
    if (!_0x44f555) {
      return;
    }
    const {
      baseHeight
    } = game.config;
    let {
      ctx,
      devicePixelRatio,
      viewWidth,
      viewHeight,
      origin,
      scale
    } = _0x44f555;
    if (game.debugView) {
      scale = 0.5;
      origin = game.space.center;
    }
    ctx.resetTransform();
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    const _0xb1eba7 = origin.x * scale - viewWidth / 2;
    const _0x52b2fa = origin.y * scale - viewHeight / 2;
    ctx.translate(-_0xb1eba7, -_0x52b2fa);
    ctx.scale(scale, scale);
    ctx.translate(0, -baseHeight);
    callback62(_0x44f555);
    callback63(_0x44f555);
    ctx.translate(0, baseHeight);
    ctx.globalCompositeOperation = "destination-over";
    callback66(_0x44f555);
    callback67(_0x44f555);
    callback68(_0x44f555);
    callback69(_0x44f555);
    ctx.globalCompositeOperation = "source-over";
    callback64(_0x44f555);
    callback65(_0x44f555);
    callback70(_0x44f555);
    callback71(_0x44f555);
    callback72(_0x44f555);
    ctx.resetTransform();
    ctx.scale(1 / devicePixelRatio, 1 / devicePixelRatio);
    if (game.player) {
      callback74(_0x44f555);
      callback76(_0x44f555);
      callback77(_0x44f555);
      callback78(_0x44f555);
      callback73(_0x44f555);
      callback79(_0x44f555);
    }
    if (game.debug || game.recording || game.replaying) {
      callback80(game);
    }
  }
  function callback80(game) {
    const {
      view
    } = game;
    if (!view) {
      return;
    }
    const {
      font
    } = game.config;
    const context = view.getContext("2d");
    context.fillStyle = "#000000";
    context.strokeStyle = "#ffffff";
    context.textAlign = "left";
    context.textBaseline = "top";
    let _0x491973 = game.quality * 160;
    const callback95 = (_0x520648 = "", _0xc64be1 = 0) => {
      if (_0x520648) {
        context.strokeText(_0x520648, 10 + _0xc64be1 * 20, _0x491973);
        context.fillText(_0x520648, 10 + _0xc64be1 * 20, _0x491973);
      }
      _0x491973 += game.quality * 20;
    };
    callback95("Update time: " + game.stats.ut.toFixed(1));
    callback95("AI time: " + game.stats.ait.toFixed(1), 1);
    callback95("Spawn time: " + game.stats.st.toFixed(1), 1);
    callback95("Render time: " + game.stats.rt.toFixed(1));
    callback95("FPS: " + Math.round(game.stats.fps));
    callback95("Quality: " + game.quality);
    callback95();
    callback95("Units: " + game.units.length);
    callback95("Level: " + game.level.toFixed(3));
    callback95();
    callback95("Particles: " + game.particles.length);
    callback95();
    if (game.recording) {
      callback95("Recording: " + game.recording.duration().toFixed(1) + " s");
    }
    if (game.replaying) {
      callback95("Replaying: " + game.replaying.currentlyPlaying().toFixed(1) + "/" + game.replaying.duration().toFixed(1) + " s");
    }
    if (game.debugGraph) {
      const _0x1d8eca = view.width / 3;
      const _0x17818e = 100;
      const path2D = new Path2D();
      const path2D2 = new Path2D();
      const path2D3 = new Path2D();
      const path2D4 = new Path2D();
      path2D4.moveTo(0, 0);
      let _0x3c276f = 16.67;
      game.metrics.forEach(_0x104637 => {
        _0x3c276f = Math.max(_0x3c276f, _0x104637.frameTime);
      });
      _0x3c276f *= 1.1;
      const _0x5baa4d = _0x1d8eca / (_0xd09b08 - 1);
      const _0x80f60e = _0x17818e / _0x3c276f;
      context.save();
      context.translate((view.width - _0x1d8eca) / 2, _0x17818e);
      context.fillStyle = "#00000033";
      context.fillRect(0, -_0x17818e, _0x1d8eca, _0x17818e);
      game.metrics.forEach((_0x2b2ec8, _0x5b33aa) => {
        path2D.lineTo(_0x5baa4d * _0x5b33aa, -_0x2b2ec8.updateTime * _0x80f60e);
        path2D2.lineTo(_0x5baa4d * _0x5b33aa, -_0x2b2ec8.renderTime * _0x80f60e);
        path2D4.lineTo(_0x5baa4d * _0x5b33aa, -(_0x2b2ec8.updateTime + _0x2b2ec8.renderTime) * _0x80f60e);
        path2D3.lineTo(_0x5baa4d * _0x5b33aa, -_0x2b2ec8.frameTime * _0x80f60e);
      });
      path2D4.lineTo(_0x5baa4d * (game.metrics.length - 1), 0);
      context.lineWidth = 1;
      const _0x531fc7 = _0x80f60e * 16.67;
      context.strokeStyle = "red";
      context.beginPath();
      context.moveTo(0, -_0x531fc7);
      context.lineTo(_0x1d8eca, -_0x531fc7);
      context.stroke();
      context.fillStyle = "#ffff00a0";
      context.fill(path2D4);
      context.strokeStyle = "#990099cc";
      context.stroke(path2D);
      context.strokeStyle = "#009900cc";
      context.stroke(path2D2);
      context.strokeStyle = "#0000ffcc";
      context.stroke(path2D3);
      context.lineWidth = 0.5;
      game.metrics.forEach((_0x56ba10, _0x3feb5f) => {
        const {
          returns,
          kills
        } = _0x56ba10.events;
        if (returns || kills) {
          if (kills) {
            context.strokeStyle = "#99000040";
          } else {
            context.strokeStyle = "#00000040";
          }
          context.beginPath();
          context.moveTo(_0x5baa4d * _0x3feb5f, 0);
          context.lineTo(_0x5baa4d * _0x3feb5f, -_0x17818e);
          context.stroke();
        }
      });
      context.restore();
    }
  }
  var _0x47dace = {
    name: "ru",
    lng: {
      yourScore: "ВАШ РЕЗУЛЬТАТ",
      bestScore: "ЛУЧШИЙ РЕЗУЛЬТАТ",
      newText: "НОВЫЙ",
      timePlayed: "ДЛИТЕЛЬНОСТЬ",
      playersKilled: "УБИТО",
      playAgain: "ИГРАТЬ СНОВА",
      menu: "МЕНЮ",
      messages: ["Не знаете как играть?", "Коснитесь экрана для управления", "Пересекайте хвосты противников и не позволяйте им пересечь свой!", "Захватите всю карту"],
      nosupport: "Игра не поддерживается на вашем браузере",
      btnPlay: "ИГРАТЬ",
      placeholderText: "Ваше имя",
      defaultPlayerName: "Игрок",
      bestTxt: "ЛУЧШИЙ",
      killText: "Убит",
      btnContinue: "ПРОДОЛЖИТЬ",
      extraLife: "ДОПОЛНИТЕЛЬНАЯ ЖИЗНЬ!",
      btnSelect: "ВЫБРАТЬ"
    }
  };
  const callback81 = (_0x25e808, _0x51cd14, callback95, _0x41c953, _0x2475cf, _0x253662) => {
    let gameApi = {};
    if (Path2D) {
      gameApi.create = _0x2702b4 => {
        const {
          arenaSize,
          quadSize,
          borderPoints
        } = _0x25e808;
        const spatialGrid2 = new SpatialGrid(arenaSize, arenaSize, quadSize);
        Vector.space = spatialGrid2;
        const vector = new Vector(arenaSize / 2, arenaSize / 2);
        const _0x36f65f = Math.min(vector.x, vector.y) * 0.95;
        const _0x53260d = Border.circular(vector, borderPoints, _0x36f65f);
        const _0x412f0f = callback95(_0x25e808, _0x2702b4);
        const game = new Game(_0x25e808, _0x2702b4, spatialGrid2, _0x53260d, _0x412f0f, null, _0x41c953, new Controller(_0x2702b4, new KeyboardModeSwitch()), _0x51cd14.lng, _0x2475cf, _0x253662, Math.random());
        _0x412f0f.game = game;
        game.renderer = _0x594216;
        gameApi.game = game;
        game.controller.addSet([16, 18, 81, 66, 77], () => {
          game.debug = !game.debug;
        });
        game.controller.addButton(71, () => {
          game.debugGraph = !game.debugGraph;
        });
      };
      gameApi.preparing = true;
      let i2 = 0;
      let _0x1e248a;
      const callback96 = () => {
        const {
          prepareMult
        } = _0x25e808;
        let {
          prepareBatchCount
        } = _0x25e808;
        while (prepareBatchCount--) {
          gameApi.game.update(1000 / 60 * prepareMult + Math.random());
          i2++;
        }
      };
      gameApi.prepare = callback97 => {
        const {
          game: gameApi2
        } = gameApi;
        _0x1e248a = setInterval(() => {
          if (_0x41c953.aviable()) {
            callback96();
            if (i2 > _0x25e808.prepareCounter) {
              clearInterval(_0x1e248a);
              gameApi.preparing = false;
              gameApi2.visible = true;
              if (!gameApi2.looped) {
                gameApi2.loop();
              }
              if (callback97) {
                callback97();
              }
            }
          }
        }, 0);
      };
      gameApi.start = (_0x726413, _0xca7aa0, _0x441c23, _0x190f9e, _0x3e0e26) => {
        const game = gameApi.game;
        if (gameApi.preparing) {
          clearInterval(_0x1e248a);
          const _0x4a84f3 = now();
          while (i2 < _0x25e808.prepareCounter) {
            callback96();
            if (now() - _0x4a84f3 > _0x25e808.maxPreparingTime) {
              break;
            }
          }
        }
        game.best = _0x441c23;
        game.spawnPlayer(_0x726413, _0xca7aa0, _0x3e0e26);
        if (_0x3e0e26) {
          game.player.addLabel({
            text: _0x47dace.lng.extraLife,
            time: 5000,
            color: "#7fed4c"
          });
        }
        if (_0x190f9e) {
          game.gameOverCallback = _0x190f9e;
        }
        gameApi.preparing = false;
        game.visible = true;
        if (!game.looped) {
          game.loop();
        }
        window.focus();
      };
    } else {
      gameApi = null;
    }
    return gameApi;
  };
  var _0x4214bf;
  var _0x336185;
  var _0x5146fe;
  var _0x45ddd0 = 0;
  var list2 = [];
  var __r = preactOptions.__r;
  var diffed = preactOptions.diffed;
  var __c = preactOptions.__c;
  var unmount = preactOptions.unmount;
  function callback82(_0x5bec12, _0x375caa) {
    if (preactOptions.__h) {
      preactOptions.__h(_0x336185, _0x5bec12, _0x45ddd0 || _0x375caa);
    }
    _0x45ddd0 = 0;
    var _0x5d4bf0 = _0x336185.__H ||= {
      __: [],
      __h: []
    };
    if (_0x5bec12 >= _0x5d4bf0.__.length) {
      _0x5d4bf0.__.push({});
    }
    return _0x5d4bf0.__[_0x5bec12];
  }
  function callback83(_0x179f26) {
    _0x45ddd0 = 1;
    return callback84(callback91, _0x179f26);
  }
  function callback84(_0x268a16, _0x77450f, callback95) {
    var _0xa8da50 = callback82(_0x4214bf++, 2);
    _0xa8da50.t = _0x268a16;
    if (!_0xa8da50.__c) {
      _0xa8da50.__ = [callback95 ? callback95(_0x77450f) : callback91(undefined, _0x77450f), function (_0x4eeef0) {
        var _0xfd25aa = _0xa8da50.t(_0xa8da50.__[0], _0x4eeef0);
        if (_0xa8da50.__[0] !== _0xfd25aa) {
          _0xa8da50.__ = [_0xfd25aa, _0xa8da50.__[1]];
          _0xa8da50.__c.setState({});
        }
      }];
      _0xa8da50.__c = _0x336185;
    }
    return _0xa8da50.__;
  }
  function callback85(_0x525b68, _0x28f13b) {
    var _0x301297 = callback82(_0x4214bf++, 3);
    if (!preactOptions.__s && callback90(_0x301297.__H, _0x28f13b)) {
      _0x301297.__ = _0x525b68;
      _0x301297.__H = _0x28f13b;
      _0x336185.__H.__h.push(_0x301297);
    }
  }
  function callback86(_0x31b960) {
    _0x45ddd0 = 5;
    return callback87(function () {
      return {
        current: _0x31b960
      };
    }, []);
  }
  function callback87(callback95, _0x481e03) {
    var _0xbe7f9a = callback82(_0x4214bf++, 7);
    if (callback90(_0xbe7f9a.__H, _0x481e03)) {
      _0xbe7f9a.__ = callback95();
      _0xbe7f9a.__H = _0x481e03;
      _0xbe7f9a.__h = callback95;
    }
    return _0xbe7f9a.__;
  }
  function callback88(_0x535df1) {
    var _0x243c65 = _0x336185.context[_0x535df1.__c];
    var _0x2f0f35 = callback82(_0x4214bf++, 9);
    _0x2f0f35.__c = _0x535df1;
    if (_0x243c65) {
      if (_0x2f0f35.__ == null) {
        _0x2f0f35.__ = true;
        _0x243c65.sub(_0x336185);
      }
      return _0x243c65.props.value;
    } else {
      return _0x535df1.__;
    }
  }
  function _0x3d47c1() {
    list2.some(function (_0xe5fad4) {
      if (_0xe5fad4.__P) {
        try {
          _0xe5fad4.__H.__h.forEach(_0x4f712f);
          _0xe5fad4.__H.__h.forEach(callback89);
          _0xe5fad4.__H.__h = [];
        } catch (_0x17c90f) {
          _0xe5fad4.__H.__h = [];
          preactOptions.__e(_0x17c90f, _0xe5fad4.__v);
          return true;
        }
      }
    });
    list2 = [];
  }
  preactOptions.__r = function (_0x1baac8) {
    if (__r) {
      __r(_0x1baac8);
    }
    _0x4214bf = 0;
    var __H = (_0x336185 = _0x1baac8.__c).__H;
    if (__H) {
      __H.__h.forEach(_0x4f712f);
      __H.__h.forEach(callback89);
      __H.__h = [];
    }
  };
  preactOptions.diffed = function (_0x293972) {
    if (diffed) {
      diffed(_0x293972);
    }
    var __c2 = _0x293972.__c;
    if (__c2 && __c2.__H && __c2.__H.__h.length) {
      if (list2.push(__c2) === 1 || _0x5146fe !== preactOptions.requestAnimationFrame) {
        ((_0x5146fe = preactOptions.requestAnimationFrame) || function (_0x1a6409) {
          var _0x2ecb0f;
          function _0x711e95() {
            clearTimeout(_0xb55311);
            if (_0x22bd21) {
              cancelAnimationFrame(_0x2ecb0f);
            }
            setTimeout(_0x1a6409);
          }
          var _0xb55311 = setTimeout(_0x711e95, 100);
          if (_0x22bd21) {
            _0x2ecb0f = requestAnimationFrame(_0x711e95);
          }
        })(_0x3d47c1);
      }
    }
  };
  preactOptions.__c = function (_0x47bb76, _0x1ced3b) {
    _0x1ced3b.some(function (_0x33039f) {
      try {
        _0x33039f.__h.forEach(_0x4f712f);
        _0x33039f.__h = _0x33039f.__h.filter(function (_0x37019a) {
          return !_0x37019a.__ || callback89(_0x37019a);
        });
      } catch (_0x1bd124) {
        _0x1ced3b.some(function (_0x25d555) {
          _0x25d555.__h &&= [];
        });
        _0x1ced3b = [];
        preactOptions.__e(_0x1bd124, _0x33039f.__v);
      }
    });
    if (__c) {
      __c(_0x47bb76, _0x1ced3b);
    }
  };
  preactOptions.unmount = function (_0x24219e) {
    if (unmount) {
      unmount(_0x24219e);
    }
    var __c2 = _0x24219e.__c;
    if (__c2 && __c2.__H) {
      try {
        __c2.__H.__.forEach(_0x4f712f);
      } catch (_0x15236f) {
        preactOptions.__e(_0x15236f, __c2.__v);
      }
    }
  };
  var _0x22bd21 = typeof requestAnimationFrame == "function";
  function _0x4f712f(_0x4727c2) {
    if (typeof _0x4727c2.u == "function") {
      _0x4727c2.u();
    }
  }
  function callback89(_0x411e83) {
    _0x411e83.u = _0x411e83.__();
  }
  function callback90(list4, _0x66baa3) {
    return !list4 || list4.length !== _0x66baa3.length || _0x66baa3.some(function (_0x2b70d2, _0x489d28) {
      return _0x2b70d2 !== list4[_0x489d28];
    });
  }
  function callback91(_0x3b7587, callback95) {
    if (typeof callback95 == "function") {
      return callback95(_0x3b7587);
    } else {
      return callback95;
    }
  }
  var assign3 = Object.assign;
  const list3 = [];
  const callback92 = _0x4bd68c => {
    const {
      en
    } = _0x4bd68c;
    Object.entries(_0x4bd68c).forEach(([_0x481b18, _0x2f0d2c]) => {
      list3.push({
        name: _0x481b18,
        lng: assign3(assign3({}, en), _0x2f0d2c)
      });
    });
  };
  const _0x4d828b = (navigator.languages && navigator.languages.length && navigator.languages[0] || navigator.userLanguage || navigator.language || navigator.browserLanguage || "en").substr(0, 2).toLowerCase();
  const callback93 = () => list3.find(_0x1a1077 => _0x1a1077.name === _0x4d828b) || list3.find(_0x55808a => _0x55808a.name === "en");
  const _0x2124e9 = callback19();
  const _0x313732 = ({
    messages
  }) => {
    const [_0x2eef6d, callback95] = callback83(0);
    callback85(() => {
      const _0x88d3da = setInterval(() => callback95(_0x39ba1e => (_0x39ba1e + 1) % messages.length), 3000);
      return () => clearInterval(_0x88d3da);
    }, []);
    return createElement("div", {
      class: "tips"
    }, createElement("div", {
      class: "tip",
      key: _0x2eef6d
    }, messages[_0x2eef6d]));
  };
  const _0x449096 = ({
    config,
    apply
  }) => {
    if (!config) {
      return null;
    }
    return createElement("form", {
      class: "config",
      onSubmit: apply
    }, Object.entries(config).map(([_0x14b1f7, _0x22ff59]) => createElement("label", {
      style: "color: white;"
    }, _0x14b1f7, "\xA0", createElement("input", {
      type: "text",
      id: _0x14b1f7,
      name: _0x14b1f7,
      value: _0x22ff59,
      autocomplete: "off",
      maxlength: "10"
    }))), createElement("button", {
      id: "apply",
      name: "apply",
      class: "yellow"
    }, "Применить"));
  };
  const _0x613dc8 = ({
    api,
    view,
    setPreparing,
    setState
  }) => {
    const _0x4dd059 = api && api.game && api.game.config;
    const _0x307f95 = event => {
      event.preventDefault();
      Object.keys(_0x4dd059).forEach(_0x4eaf3c => {
        const element = document.getElementById(_0x4eaf3c);
        if (element) {
          const _0x5c8252 = parseFloat(element.value);
          _0x4dd059[_0x4eaf3c] = _0x5c8252 !== _0x5c8252 ? element.value : _0x5c8252;
        }
      });
      api.game.stopped = true;
      api.create(view.current);
      setPreparing(true);
      api.prepare(() => setPreparing(false));
      setState("menu");
    };
    return createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(_0x449096, {
      config: _0x4dd059,
      apply: _0x307f95
    }));
  };
  const _0x11635f = ({
    setLanguage
  }) => {
    const _0x3ae834 = callback88(_0x2124e9);
    const _0x1df60f = list3.map((_0x159de4, _0x1a5dca) => createElement("li", {
      class: _0x159de4 === _0x3ae834 ? "active" : "",
      onClick: () => setLanguage(list3[_0x1a5dca])
    }, _0x159de4.name.toUpperCase()));
    return createElement("div", {
      id: "footer"
    }, createElement("ul", {
      id: "lng"
    }, _0x1df60f));
  };
  const _0x2b87a7 = ({
    nickName,
    setNickName,
    playable,
    preparing,
    start,
    route,
    provider,
    setLanguage,
    api,
    skin
  }) => {
    const {
      lng
    } = callback88(_0x2124e9);
    const _0x7e5b2d = api && api.game && api.game.config;
    const _0x582227 = !!api;
    const _0x3e6418 = _0x474014 => setNickName(_0x474014.target.value);
    const _0x56e19e = _0x582227;
    const _0xe04ee3 = event => {
      event.preventDefault();
      if (_0x56e19e) {
        start();
      }
    };
    callback85(() => {
      if (window.ads && window.ads.showAds) {
        window.ads.showAds();
      }
    }, []);
    return createElement(_0x1a6367, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(_0x313732, {
      messages: lng.messages
    }), createElement("div", {
      class: "play"
    }, createElement("input", {
      type: "text",
      id: "nick",
      name: "nick",
      value: nickName,
      autocomplete: "off",
      placeholder: lng.placeholderText,
      maxlength: "12",
      oninput: _0x3e6418
    }), createElement("button", {
      id: "play",
      name: "play",
      class: "yellow" + (_0x56e19e ? "" : " disabled"),
      onClick: _0xe04ee3
    }, lng.btnPlay), createElement("button", {
      id: "skins",
      name: "skins",
      class: "orange noPadding",
      onClick: () => route("skins")
    }, createElement("img", {
      width: "30",
      height: "30",
      src: "assets/skins/select/" + (skin || "noskin").toLowerCase().replace(/\s+/g, "") + ".png"
    }))), !_0x582227 && createElement("p", {
      class: "notsupported"
    }, lng.nosupport)), createElement("div", {
      id: "right_side"
    }));
  };
  const _0x5389c6 = ({
    nickName,
    bestScore,
    setBestScore,
    setResults,
    setPreparing,
    api,
    route,
    skin,
    lastPercent
  }) => {
    callback85(() => {
      const _0x545eda = _0x3ee818 => {
        if (_0x3ee818.newBest) {
          setBestScore(_0x3ee818.score);
        }
        setResults(_0x3ee818);
        route("results");
      };
      if (window.ads && window.ads.hideAds) {
        window.ads.hideAds();
      }
      api.game.language = callback88(_0x2124e9).lng;
      let skin2 = skin;
      if (skin2 === "default" || skin2 === "No skin") {
        skin2 = "";
      }
      api.start(nickName, skin2, bestScore, _0x545eda, lastPercent);
      const {
        dataLayer
      } = window;
      if (dataLayer) {
        dataLayer.push({
          event: "levelStart",
          publisher: "CONNECT2MEDIA",
          productKey: "paper2IO"
        });
      }
      setPreparing(false);
    }, []);
    return null;
  };
  const _0x665b7b = ({
    bestScore,
    results,
    start,
    route,
    provider,
    country = undefined
  }) => {
    const _0xb87c1f = () => route("menu");
    const {
      lng
    } = callback88(_0x2124e9);
    const {
      dataLayer
    } = window;
    if (dataLayer) {
      dataLayer.push({
        event: "levelCompletion",
        publisher: "CONNECT2MEDIA",
        productKey: "paper2IO"
      });
    }
    callback85(() => {
      if (window.ads && window.ads.showAds) {
        window.ads.showAds();
      }
    }, []);
    return createElement(_0x1a6367, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement("div", {
      class: "nav"
    }, createElement("button", {
      class: "yellow slider-5",
      id: "menu",
      onClick: _0xb87c1f
    }, lng.btnContinue)), createElement("div", {
      class: "resultbox"
    }, createElement("div", {
      class: "results"
    }, createElement("div", {
      class: "left"
    }, createElement("div", {
      class: "slider-1"
    }, lng.yourScore, ":"), createElement("div", {
      class: "slider-2"
    }, results.newBest && createElement("span", {
      class: "newScore"
    }, lng.newText, " "), lng.bestScore, ":"), createElement("div", {
      class: "slider-3"
    }, lng.timePlayed, ":"), createElement("div", {
      class: "slider-4"
    }, lng.playersKilled, ":")), createElement("div", {
      class: "right"
    }, createElement("div", {
      class: "slider-1"
    }, results.score.toFixed(2) + "%"), createElement("div", {
      class: "slider-2"
    }, bestScore.toFixed(2) + "%"), createElement("div", {
      class: "slider-3"
    }, new Date(results.time).toISOString().slice(14, -5)), createElement("div", {
      class: "slider-4"
    }, results.kills)))), createElement("div", {
      id: "yandex_rtb"
    })), createElement("div", {
      id: "right_side"
    }));
  };
  const _0x16897a = ({
    name
  }) => {
    return createElement("div", {
      class: "skin"
    }, createElement("div", {
      class: "skin-view"
    }, createElement("h3", null, name), createElement("img", {
      src: "assets/skins/select/" + name.toLowerCase().replace(/\s+/g, "") + ".png"
    })));
  };
  const _0x226e7e = ({
    skins,
    skin,
    menu,
    setSkin
  }) => {
    const {
      lng
    } = callback88(_0x2124e9);
    const _0x38fb57 = skins.findIndex(_0x46e46c => _0x46e46c.name === skin);
    const [_0x52fa22, callback95] = callback83(_0x38fb57 > 0 ? _0x38fb57 : 0);
    const callback96 = _0xfc8857 => {
      if (_0xfc8857 >= 0 && _0xfc8857 < skins.length) {
        callback95(_0xfc8857);
        setSkin(skins[_0xfc8857].name);
      }
    };
    return createElement("div", {
      class: "skinbox"
    }, createElement("div", {
      class: "skins-container"
    }, createElement("button", {
      name: "left",
      class: "orange",
      onClick: () => callback96(_0x52fa22 - 1)
    }, "<"), createElement(_0x16897a, {
      name: skins[_0x52fa22].name
    }), createElement("button", {
      name: "right",
      class: "orange",
      onClick: () => callback96(_0x52fa22 + 1)
    }, ">")), createElement("div", {
      class: "nav"
    }, createElement("button", {
      class: "green",
      onClick: menu
    }, lng.btnSelect)));
  };
  const _0x33ae25 = ({
    skins,
    skin,
    route,
    setSkin
  }) => {
    const _0x511672 = () => route("menu");
    callback85(() => {
      const element = document.getElementById("paperio-site_multisize");
      if (element) {
        element.style.display = "none";
      }
    }, []);
    return createElement(_0x1a6367, null, createElement("div", {
      id: "left_side"
    }), createElement("div", {
      class: "uibox"
    }, createElement("div", {
      class: "logo"
    }, createElement("img", {
      src: "assets/images/logo.png"
    })), createElement(_0x226e7e, {
      skins: [{
        name: "No skin"
      }].concat(skins),
      menu: _0x511672,
      setSkin: setSkin,
      skin: skin
    })), createElement("div", {
      id: "right_side"
    }));
  };
  const _0x1d032c = ({
    api,
    storage,
    ads,
    provider,
    skins,
    mode = "common"
  }) => {
    const _0x2a1468 = callback86(null);
    const [_0xae90a5, callback95] = callback83(false);
    const [_0x3c010f, callback96] = callback83("menu");
    const [_0x7671bd, callback97] = callback83(true);
    const [_0x293a25, _0x5c440b] = callback83(callback93());
    const [_0x50dae7, _0x536f0c] = callback83(null);
    const _0x1cb8f8 = "paper.io.storage";
    const _0x16b845 = storage.getJSON(_0x1cb8f8) || {};
    const [_0x38110e, _0x495989] = callback83(_0x16b845.nickName || "");
    const [_0x43a473, _0x421708] = callback83(_0x16b845.bestScore || 0);
    const [_0x4f80f0, _0x33ebdc] = callback83(_0x16b845.skin || "");
    const _0x48fc9f = {
      expires: 365
    };
    if (_0x38110e !== _0x16b845.nickName || _0x43a473 !== _0x16b845.bestScore || _0x4f80f0 !== _0x16b845.skin) {
      storage.set(_0x1cb8f8, {
        nickName: _0x38110e,
        bestScore: _0x43a473,
        skin: _0x4f80f0
      }, _0x48fc9f);
    }
    callback85(() => {
      if (api) {
        api.create(_0x2a1468.current);
        api.prepare(() => callback97(false));
        callback95(true);
      }
    }, []);
    api.startGame = () => {
      const element = document.getElementById("overlay");
      if (element) {
        element.style.display = "none";
      }
      if (api && api.game) {
        api.game.visible = true;
      }
      callback96("game");
    };
    const _0x28fd93 = () => {
      const element = document.getElementById("overlay");
      if (element) {
        element.style.display = "block";
        element.style.animation = "fadein 500ms";
      }
      if (api && api.game) {
        api.game.visible = false;
      }
      window.ShowPreroll();
    };
    return createElement(_0x1a6367, null, createElement("canvas", {
      class: _0x3c010f === "game" || _0x7671bd ? "" : "fadein",
      id: "view",
      ref: _0x2a1468
    }), _0x3c010f !== "game" && createElement("div", {
      id: "ui_overlay"
    }), createElement(_0x2124e9.Provider, {
      value: _0x293a25
    }, createElement("div", {
      id: "ui",
      class: _0x3c010f === "game" ? "hide" : ""
    }, _0x3c010f === "menu" && createElement(_0x2b87a7, {
      nickName: _0x38110e,
      setNickName: _0x495989,
      playable: _0xae90a5,
      preparing: _0x7671bd,
      start: _0x28fd93,
      route: callback96,
      provider: provider,
      setLanguage: _0x5c440b,
      api: api,
      setState: callback96,
      skins: skins,
      skin: _0x4f80f0
    }), _0x3c010f === "game" && createElement(_0x5389c6, {
      nickName: _0x38110e,
      bestScore: _0x43a473,
      setBestScore: _0x421708,
      setResults: _0x536f0c,
      setPreparing: callback97,
      api: api,
      route: callback96,
      skin: _0x4f80f0
    }), _0x3c010f === "results" && createElement(_0x665b7b, {
      bestScore: _0x43a473,
      results: _0x50dae7,
      start: _0x28fd93,
      route: callback96,
      provider: provider
    }), _0x3c010f === "config" && createElement(_0x613dc8, {
      api: api,
      view: _0x2a1468,
      setPreparing: callback97,
      setState: callback96
    }), _0x3c010f === "skins" && createElement(_0x33ae25, {
      skins: skins,
      skin: _0x4f80f0,
      route: callback96,
      setSkin: _0x33ebdc
    })), _0x3c010f !== "game" && createElement(_0x11635f, {
      setLanguage: _0x5c440b
    })), createElement("div", {
      id: "overlay"
    }));
  };
  let _0x30561b = {
    arenaSize: 2000,
    quadSize: 20,
    borderPoints: 300,
    prepareMult: 3,
    prepareBatchCount: 5,
    maxPreparingTime: 500,
    baseRadius: 30,
    baseCount: 50,
    minScale: 3,
    maxScale: 4.5,
    observerScale: 2.5,
    trackWidth: 8,
    unitSpeed: 90,
    spawnTimeout: 3000,
    prepareCounter: 6000,
    prepareAcceleration: 30,
    baseHeight: 2,
    botsCount: 15,
    botLevel: -1,
    startBotLevel: 0.1,
    noPlayerBotLevel: 0.5,
    nearPlayerBotSpawnCount: 1,
    followKiller: true,
    selfKillDelay: 1000,
    enemyKillDelay: 2000,
    arenaColor: "#e7fff4",
    borderColor: "#88a799",
    backgroundTopColor: "#2d6998",
    backgroundBottomColor: "#81faff",
    platesStrokeWidth: 0,
    botAggroMin: 0.2,
    botAggroMax: 1,
    botDefMin: 1.2,
    botDefMax: 0.6,
    botGreedMin: 0.1,
    botGreedMax: 0.6,
    botSafetyMin: 0.5,
    botSafetyMax: 1,
    botAttackTrackLength: 1500,
    font: "PT Sans Caption"
  };
  var _0x4b9315 = ["#3b5998", "#8b9dc3", "#2a4d69", "#4b86b4", "#8dbdff", "#64a1f4", "#3b7dd8", "#843b62", "#8874a3", "#8d5524", "#c68642", "#f1c27d", "#f77f00", "#fcbf49", "#ffe066", "#65737e", "#a7adba", "#4a7c59", "#1a936f", "#88d498", "#2a9d8f", "#68b0ab", "#99e550", "#6abe30", "#4b692f", "#8f974a", "#8a6f30", "#524b24", "#d62828", "#fe4a49", "#ed6a5a", "#ff3377", "#ff77aa", "#ff99cc", "#b23a48", "#fcb9b2"];
  var assign4 = Object.assign;
  class Skin {
    constructor() {
      this.config = undefined;
      this.user = undefined;
      this.name = undefined;
      this.assets = [];
      this.colors = {
        main: "black",
        back: "black",
        nick: "black",
        plate: "black",
        particles: ["black"]
      };
      this.pattern = null;
      this.container = new DisplayList();
    }
    addAsset(_0x5aa709) {
      if (_0x5aa709.content.colors) {
        this.colors = _0x5aa709.content.colors;
      }
      if (_0x5aa709.content.pattern) {
        this.pattern = _0x5aa709.content.pattern;
      }
      if (_0x5aa709.content.display) {
        this.container.add(_0x5aa709.content.display);
      }
      this.assets.push(_0x5aa709);
    }
  }
  class Asset {
    constructor(_0x4fe703) {
      this.pool = undefined;
      this.loadingStarted = false;
      this.name = _0x4fe703;
      this.content = {};
      this.ready = false;
    }
    load() {}
  }
  class SvgAsset extends Asset {
    constructor(_0xb63175, _0x332715, _0x2a70ba) {
      super(_0x332715);
      this.pool = _0xb63175;
      this.source = _0x2a70ba;
    }
  }
  class ImageAsset extends Asset {
    constructor(_0x4a0858, _0xeae6e, _0x2ae3f4) {
      super(_0xeae6e);
      this.pool = _0x4a0858;
      this.source = _0x2ae3f4;
    }
    load() {
      if (this.loadingStarted) {
        return;
      }
      this.loadingStarted = true;
      const _0x173606 = () => {
        this.ready = this.content.display.ready && (this.content.pattern ? this.content.pattern.ready : true);
      };
      const {
        source
      } = this;
      if (source.colors) {
        this.content.colors = assign4({
          main: "#000000",
          back: "#000000",
          nick: "#000000",
          plate: "#000000",
          particles: ["#000000"]
        }, source.colors);
      }
      if (source.pattern) {
        this.content.pattern = new PatternAsset(this.pool.config, this.pool.view, this.pool.path, source.pattern, _0x173606);
      }
      if (source.avatar) {
        this.content.display = new Avatar(this.pool.config, this.pool.path, source.avatar, _0x173606);
      }
    }
  }
  class AssetSet {
    constructor(_0x656842) {
      this.config = undefined;
      this.name = _0x656842;
      this.assets = [];
    }
    get(_0x58d069, _0x5971db) {
      let _0x1058fe;
      _0x1058fe = this.assets.find(_0x5e1caf => _0x5e1caf.name === _0x58d069 && (_0x5971db ? _0x5e1caf.ready === true : true));
      if (!_0x1058fe) {
        return null;
      }
      _0x1058fe.load();
      return _0x1058fe;
    }
  }
  class ImageAssetSet extends AssetSet {
    constructor(_0x330904) {
      super("colors");
      this.config = _0x330904;
      this.add(_0x4b9315);
    }
    add(_0x1f90aa) {
      const {
        config
      } = this;
      this.assets.push(...(_0x1f90aa || []).map(_0x1af67d => {
        const _0x1b3992 = callback34(_0x1af67d);
        const _0x89367 = callback35(_0x1b3992);
        const _0x468f36 = callback41(_0x89367, 0.75);
        const _0x1daa61 = callback38(_0x468f36);
        const _0x10a960 = callback41(_0x89367, 0.5);
        const _0x5d6eb5 = callback38(_0x10a960);
        const _0x48b60f = callback42(_0x89367, 1.5);
        const _0x53ef8a = callback38(_0x48b60f);
        const _0x4a4356 = callback42(_0x89367, 2);
        const _0x545b5f = callback38(_0x4a4356);
        const _0x11e5b6 = {
          main: _0x1af67d,
          back: _0x1daa61,
          nick: _0x5d6eb5,
          plate: _0x89367.v > 50 ? _0x5d6eb5 : _0x545b5f,
          particles: [callback38(callback43(_0x89367, 100)), callback38(callback43(_0x89367, 90)), callback38(callback43(_0x89367, 80)), callback38(callback43(_0x89367, 70)), callback38(callback43(_0x89367, 60)), callback38(callback43(_0x89367, 50)), callback38(callback43(_0x89367, 40)), callback38(callback43(_0x89367, 30)), callback38(callback43(_0x89367, 20))]
        };
        const svgAsset = new SvgAsset(this, _0x1af67d, _0x11e5b6);
        svgAsset.content.colors = _0x11e5b6;
        if (config) {
          svgAsset.content.display = new Avatar(config, "", {
            layers: [{
              src: callback94(_0x11e5b6.nick, _0x11e5b6.nick)
            }, {
              level: 1,
              src: callback94(_0x11e5b6.main, _0x11e5b6.back)
            }]
          });
        }
        svgAsset.ready = true;
        svgAsset.name = _0x1af67d;
        return svgAsset;
      }));
    }
    loadAsset(_0x49b2f3) {
      return _0x49b2f3;
    }
  }
  class SvgAssetSet extends AssetSet {
    constructor(_0x2fdfed, _0x4c761d, _0x3697eb, _0x21aa5d, _0x2e765a = false) {
      super("classic");
      this.config = _0x2fdfed;
      this.view = _0x4c761d;
      this.path = _0x3697eb;
      this.add(_0x21aa5d);
      if (_0x2e765a) {
        for (let _0xe20107 of this.assets) {
          _0xe20107.load();
        }
      }
    }
    add(_0x4f0d2d) {
      this.assets.push(...(_0x4f0d2d || []).map(_0x65e918 => new ImageAsset(this, _0x65e918.name, _0x65e918)));
    }
  }
  function callback94(_0x42a686, _0x46edb9) {
    const element = document.createElement("canvas");
    element.width = 100;
    element.height = 100;
    const context = element.getContext("2d");
    context.fillStyle = _0x46edb9;
    context.fillRect(0, 0, 100, 100);
    context.fillStyle = _0x42a686;
    context.fillRect(10, 10, 80, 80);
    return element;
  }
  class SkinManager {
    constructor(_0x303ba9) {
      this.usedBy = {};
      this.assets = {};
      this.unusedAssets = {};
      this.rng = callback39(_0x303ba9);
    }
    registerAsset(_0xe4279d, _0x41ecba) {
      this.unusedAssets[_0xe4279d.name] = this.assets[_0xe4279d.name] = {
        asset: _0xe4279d,
        tag: _0x41ecba
      };
    }
    registerAssets(_0x326294, _0x1f77bd) {
      for (let _0x1ef8e7 of _0x326294.assets) {
        this.registerAsset(_0x1ef8e7, _0x1f77bd);
      }
    }
    available(_0xedc88d) {
      let list4 = Object.values(this.unusedAssets);
      if (_0xedc88d) {
        return list4.filter(_0x53c6d7 => _0x53c6d7.tag == _0xedc88d).length;
      } else {
        return list4.length;
      }
    }
    has(_0x3ee3b8) {
      return _0x3ee3b8 in this.unusedAssets;
    }
    randomAssetName(_0x358092, _0x34ea06 = true) {
      let _0x4e7371 = _0x34ea06 ? this.unusedAssets : this.assets;
      let list4 = Object.keys(_0x4e7371);
      if (_0x358092) {
        list4 = list4.filter(_0x41a7d2 => _0x4e7371[_0x41a7d2].tag == _0x358092);
      }
      let _0xd5f9bb = this.rng(list4.length);
      let _0x2074b4 = list4[_0xd5f9bb];
      return _0x2074b4;
    }
    get(_0x2e4e12, _0x4f1e5b) {
      if (!_0x2e4e12) {
        _0x2e4e12 = this.randomAssetName(_0x4f1e5b);
      }
      let asset = this.assets[_0x2e4e12].asset;
      delete this.unusedAssets[_0x2e4e12];
      asset.load();
      const skin = new Skin();
      skin.addAsset(asset);
      skin.name = _0x2e4e12;
      this.usedBy[_0x2e4e12] = (this.usedBy[_0x2e4e12] || []).concat(skin);
      return skin;
    }
    release(_0x17a073) {
      this.usedBy[_0x17a073.name] = this.usedBy[_0x17a073.name].filter(_0x3b65a5 => _0x3b65a5 != _0x17a073);
      if (this.usedBy[_0x17a073.name].length == 0) {
        delete this.usedBy[_0x17a073.name];
        this.unusedAssets[_0x17a073.name] = this.assets[_0x17a073.name];
      }
    }
    reskin(_0x42dc05) {
      let _0x18b3e0 = this.usedBy[_0x42dc05];
      if (_0x18b3e0) {
        for (let _0xd0288e of _0x18b3e0) {
          _0xd0288e.user.setSkin(this.get());
        }
        delete this.usedBy[_0x42dc05];
      }
    }
    getCitySkin(_0x5b0870) {}
  }
  class GameSkinManager extends SkinManager {
    constructor(_0x12b771, _0x326bab, _0xf7287f) {
      super(_0xf7287f);
      this.registerAssets(_0x12b771, "colored");
      this.registerAssets(_0x326bab, "classic");
    }
    getPlayerSkin(_0x3560bf) {
      if (!_0x3560bf) {
        return this.get(null, "colored");
      }
      this.reskin(_0x3560bf);
      return this.get(_0x3560bf);
    }
    getBotSkin() {
      let _0x1782a5 = this.rng() < 0.25 ? ["colored", "classic"] : ["classic", "colored"];
      let _0x44aa5f = this.randomAssetName(_0x1782a5[0], true) || this.randomAssetName(_0x1782a5[1]);
      return this.get(_0x44aa5f);
    }
  }
  const _0x5be379 = "DeadMorose\nold_demon\nfox\nDeFreeZe\nGoSeek\nKeyplex\nDarkfury\nFunnyway\nBLACK_PRINCE\n[BigBoss]ShadiBoo\nDizzer\nKARATEL\nHowlux\nLight_Soul\n2fab4u\nBoOT\nMrKat2017\nSkulL\nCmeTano4Ka\nflash\nh1me3ra\nHoward\ni_Pro\nred_devil\nbest_of_the_best\nblow_crazy \nface_of_vengeance\nGlambit \nMASTER_GRIF\nMr.ByBlIk\nn1ce_DayZ\nRantom\nAbove Daemons\ncompany_THE_Best\nDanie\ndarklight\nDaxmaut\ndiablo\ngreat_man\nkiller_innothing\nNix\nValett\nDarkAngelKael\nduelist\ni_zadrot\nMonster_Energy\nMr.Winston\nRaindrops\nSumerbraum\nTermit\nTITAN\nWOOOlf\nAVSTRAL\nBadLike\nBuri\ncop_zombie\ndestroyer_for_us\nEKEN\nEksnet\nFrostorik\nghost_of_fear\nHotzarzim\nj111m\nKael\nKikET\n4CHAN\nPIKABU\n9GAG\naustralia\naustria\nayylmao\nbait\nbangladesh\nbelgium\nbosnia\nbotswana\nbrazil\nbulgaria\ncambodia\ncanada\nchile\nchina\ncia\nconfederate\ncroatia\ndenmark\nea\nearth\nestonia\neuropeanunion\nfacepunch\nfeminism\nfinland\nfrance\ngermanempire\ngermany\ngreece\nhongkong\nhungary\nindia\nindiana\nindonesia\niran\niraq\nireland\nitaly\njamaica\njapan\nkc\nlatvia\nlithuania\nluxembourg\nmaldivas\nmatriarchy\nmexico\nmoon\nnazi\nnetherlands\nnigeria\nnorthkorea\nnorway\norigin\npakistan\npatriarchy\nperu\npewdiepie\npiccolo\npoland\nportugal\nprodota\nqingdynasty\nquebec\nreddit\nrussia\nsanik\nsatanist\nsealand\nsouthkorea\nspain\nstalin\nsteam\nsweden\nswitzerland\ntaiwan\ntexas\nthailand\ntsaristrussia\ntumblr\nukraine\nunitedkingdom\nusa\nussr\nvinesauce\nyaranaika\ntumblr\nhongkong\nKillerGamer\nLimuzin\nmage\nMCGaMeR\nMr_Het\nNadornsMonsters\nnero\noutcaster\nSteepCat\nTUCA\nurban_hunter\nvirtual_lord\nwertyi\nWinstonLight\nWoJDoo\nArtemad\nClydeKautz\nBarney\nRhodaPing\nSharlaPropes\nNanciTyner\nIlaWorm\nSebastianRawlinson\nCraigFlury\nEstebanBrehm\nDeberaVancuren\nTabithaOlivieri\nTrishaKimball\nMilagrosHyler\nCinderellaGerson\nFranBaldridge\nMelisaBrock\nGaynelleSimmonds\nEttaMirabella\nLaveraLabrecque\nBudNormand\nEliasSherwood\nJackpot\nSensation\nChuck\nSoots\nTheSaint\nICEman\nMiracleSnoopy\nBahartet\nBiotary\nHammer85\nBizcarit\nBlackenta\nBurkelstrin\nBurntSeen\nChariana\ngoldfinger\nConfidentHelp\nCopiconc\nDemocoman\nGaartely\nGenantro\nGlitzMcGenius\nJuliatu\nKalstaxi\nKeymatr\nKredicon\nLuvGurly\nMasteranca\nMediaBolt\nMeemuset\nMonsterInformer\nOccuiffu\nOnnitall\nRodeonevedo\nSandBlondeFully\nShipnease\nSlypectle\nSpinfonexu\nAdocarli\nAnglosi\nSimba\nAuetonbr\nBanshfeli\nQWERT\nBezequaci\nBizarrebobw\nBizarrewo\nBlenetra\nBootXboxStein\nBradleyFinest\nCeticRaven\nChunkyKlug\nDailiesHigh\nDravencybe\nFarerSaiyan\nGabring\nHalcytech\nHeminepe\nHeraldhama\nImagene\nLolandexte\nLucebayn\nMatroner\nMediumbben\nMofficanki\nNateinvelo\nTIMBERLAKE\nNessDiddy\nPlatinumTrippin\ntheviking\nPlusedge\nRaetstalyda\nJustinStromberg\nRebecaSenn\nRoxy\nNeil\nMaria\nWarren\nGrace\nWilliam\nJane\nVanessa\nLisa\nStephanie\nDidi\nBoris\nRuth\nLeonard\nJack\nCaroline\nSebastian\nConnor\nIan\nTOMAS\nSue\nFOX\nDylan\nLisa\nGrace\nJabbaDabba\nJennifer\nBenjamin\nPiPPa\nSteven\nJoe\nKNine\nKevin\nCaroline\nMcFlurry\nKatherine\nLeah\nIrene\nOwen\nUna\nGabrielleSlater\nAmyFisher\nAngelaGrant\nAlisonOgden\nDeadshot\nNitro\nTrevorBlack\nKatherinePullman\nOliverMacDonald\nAvaVaughan\nJenniferWhite\nWarrenPeters\nLeahCameron\nAlisonBerry\nKeithBuckland\nJulianMackay\nNatalieSanderson\nviZion\nJoshuaPeake\nKeithDowd\nHotdog\nJamesLambert\nJanBond\nColinMarshall\nJasonRees\nFRED\nJaneHughes\nLeonardOliver\nHarryAnderson\nGraceSmith\nDeirdreJones\nAudreySpringer\nEllaGray\nDominicHamilton\nKeithBlake\nRuthJackson\nMollyHudson\nSophieBerry\nCarolineLyman\nEmmaHudson\nJoeLyman\nOliviaPiper\nChristopherAllan\nMariaKing\nPippaSlater\nSarahJohnston\nRyanWhite\nJackHill\nWilliamMackay\nBenjaminAlsop\nAmandaRoberts\nThomasParsons\nLiamMcGrath\nJanHenderson\nSoniaChapman\nWilliam\nLily\nPeter\nKeith\nIsaac\nLeah\nMadeleine\nKaren\nFrank\nAlan\nMichael\nRachel\nDominic\nPaul\nNicola\nEmily\nTim\nbigBEN\nCohen\nGood\nFrancis\nOdom\nGreen\nCain\nTrevino\nLucero\nAshley\nigloo\nduffer\nloaded\nsickness\ngreeting\nlonely\nbafflement\ntrusty\nalteration\nevil\nsolva\npenumbra\ndauphine\nalluring\nlilly\nstinchar\ncubic\nblackbrook\nrebuff\ninclined\nlyon\nsquash\nunique\nlyne\nchewy\nmasticate\nmagnet\nknit\nindolent\nsevere\nfestus\ntrain\nincisionKim\nBean\nAguilar\nErnesto\nCurtis\nCortez\nTyshawn\nBrady\nBeckett\nXavier\nCason\nBryson\nSheldon\nPierce\nDeshawn\nAndy\nAaron\nArmando\nKarson\nK9\nNadia\nJovan\nErin\nTerry\nGrayson\nCelia\nAlexzander\nCannon\nJoey\nStella\nGracie\nKFCLOVER\nChico\nPrince\nMocha\nScooter\nChester\nCoco\nDusty\nZoe\nSocks\njefferson\nignore\nalladale\nvirtue\nprovided\ncohesive\nbullfinche\ncomet\ndip\nzipper\npostulate\nlick\nbashful\npascals\nrudy\ngloaming\ncashew\nmixcloud\ntraumatic\nprostate\npeas\nmelon\nbulbous\ngavel\nnumnah\nnavel\nriver\nsaskatoon\ncaused\nhardy\npare\nfemale\nvolunteer\nspeck\nyears\nvalid\narmpit\nbobby\nbolham\ngoogle\nbrennand\npastry\nweapon\ncuillin\ndescent\neasier\nmore\nrisedale\ngoggles\ncute\nmagellanic\nrenal\nzunyi\nEveryPrivate\nChipmunkThreat\nLeafyForefoot\nSebastianExxon\nHuckFaisalabad\nWheelchairHadar\nBulimiaMilk\nEiderStallion\nMoronicBuckinghamshire\nPayBiff\nHillsboroughEnvelope\nAllianzRhapsody\nArseEnteral\nBoronRadiant\nArchiveUntrue\nPlasticSpeech\nOfficerWiltshire\nBungBuzzard\nMoscowStellar\nTrialsHearty\nModelHorse\nBootsGrimacing\nShiraMosedale\nLeopardClapper\nSkatersStars\nCaramelizeStraws\nAngolanVinomadefied\nBatterySiemens\nHedgeThompson\nLukaIcing\nMimosaBrunswick\nTinForgetful\nHumberHook\nSeagullTrump\nBookerTouring\nSugarWarn\nCustardsStructure\nRudyBarium\nElectrolyteDisfigured\nBlighterPhysicist\nAntoniadiAtom\nPachaRule\nMaltyPatches\nHonoluluSwedish\nGemGleaming\nAssociatedThose\nAfterCointreau\nEyesPierre\nStewartGels\nAretePuppy\nFullscreenTrophic\nMailWillow\nScaupFrosty\nZaraBipedal\nCheapScafell\nDevonYolk\nSkegCohesive\nCricketBashful\nCocoaPuck\nDecathlonIschemic\nOftSnottor\nCheepNewlyn\nSwimGrill\nBaubleSymbolic\nAstronomerSpam\nVarlotLealt\nSensorSquamish\nKeyTechnetium\nCrummyQuirky\nVinePlane\nWaterskiBlind\nOrdinateCrown\nSpotTense\nFumeVine\nGlasswareCherries\nPhenomenonWillied\nPappusWazzed\nFilterSpace\nHypnosisSociable\nGaffEnder\nTordaHelpless\nResearchMat\nAmpereHeptagon\nEclipseBaldy\nLliediDiopside\nRockersGatcombe\nSabineEssential\nPlutoAbsurd\nTagTestify\nForswearJosie\nEquuleusFalter\nChewieFluther\nWombYakama\nHinderHighland\nBiteSeptum\nRifleGym\nJuneauInboard\nTroubadourChillingwood\nNeogeneLecturer\nSullivanStencils\nCheesecakePit\nClumpUnhelpful\nCheckBig\nLollyPumpkin\nCitrusyCountless\nVarunaRemy\nDivergentOils\nFallingTalisker\nBlackwaterNifty\nBrinkworthFranklyn\nFreddyPostman\nClumperPoke\nSlopeTokahee\nStencilsHume\nJijiKey\nAdeptStores\nUnicodeIgneous\nMeatyNut\nMaskSpark\nForegoingMoist\nEthicalConfident\nOblongataIsraeli\nGreenAle\nFibulaJoss\nShrugMinge\nFlowsWhispers\nActiveGlissade\nExaltedSpaghetti\nMeerkatMatch\nCouldHoff\nYawnObtuse\nCrazyUnknown\nPlanemoTyler\nCalderaBeans\nSoundcloudJapan\nSeveralGalled\nStarbucksDomain\nEdibleGlazier\nResourcesCapital\nNitrogenBella\nFlavorfulProtoplanet\nTeachSqueeze\nMeiosisSiphon\nTelephoneMarl\nTrundleRitec\nTheodoreShamrock\nNoirMelody\nVanillaArmenian\nHonkExoticism\nMandibleSepsis\nVenomousSignal\nManukaEval\nLooksLeaves\nFriedInto\nBlowTalented\nStubbsHeadphones\nWigeonNewcastle\nLoadHamster\nPinkieSaint\nEuphoniumRedundant\nSabdenRoad\nSuccessApache\nPateraCitric\nBalnagownQuiver\nGambianHartford\nRidingNostalgic\nAmbushFlex\nBretonCommon\nSpot!Fine\nPlaintivePride\nDiphthongPraline\nShearraInflate\nWoldsLennon\nSordiniMeathead\nSordCegidog\nSelfiesWeigh\nOrganVile\nPinchWeixin\nSassyFlag\nAlberniDart\nBowenImmense\nRulerFocus\nMaggotMine\nRegulateInventions\nMeshAlbite\nPoxArabella\nTikiFredericton\nNeedleDiapir\nGeneBlurt\nBindyFollowed\nMongolianTurtle\nSenseProfess\nFoldingHacking\nArsonistClipping\nKerryBonnie\nMaliciousMilitary\nMountainFrivolous\nCannonCog\nCordFlapping\nSnickerIndonesian\ndome\nking\nohio\nstandard\nfustilarian\nnative\nsupply\namherst\ninitial\ntowel\npumpion\nperfect\nmouldy\nflasks\ncarina\nduchess\ncrackers\nexciting\nhole\nwiggle\ngreat\nben\npoop\notis\npolite\nslapping\notherwise\ngrilled\nwes\nsummary\nnice\nbasketball\nstarbolins\nbaby\nbooking\nrhubarb\nperson\nshooter\nbounded\nnorthamptonshire\nsyllable\ngreenish\nuptight\ntweed\nthe\nreeky\nlathered\nascension\nobtain\nnagging\nchallenger\nsecret\nworcester\nlangley\npolly\nurinal\ntrusting\nbeverley\nfrankie\ndartmoor\nmash\ngillie\nmethodist\ngalaxy\nmozart\nbarrage\nspoticus\nscheduled\neel\npanel\nflapjack\nchemist\nalbert\nmetacarpus\ndense\nbleeding\nfixation\nniggles\ncamel\nrosin\ncommunity\nleash\ndulais\nladder\nlee\nindices\nyou\neducation\ndumplings\nbid\nprince\nartiste\navocet\nburns\nbarney\nmanaged\nburritos\npeduncle\npaltry\nequator\nsubmerge\nexpected\nfags\nperl\nclueless\ncartier\nwombled\nbearded\nkalman\ntrees\npink\naddie\ntod\nusd";
  var _0x113767 = _0x5be379.split("\n");
  var assign5 = Object.assign;
  console.log("Version: A6 2020-10-14T10:51:36.392Z");
  const _0x2ed33d = assign5(assign5({}, _0x30561b), {
    followKiller: true,
    selfKillDelay: 1000,
    enemyKillDelay: 2000
  });
  const _0x5d6a09 = fetch("assets/languages.json").then(_0x4c4ec9 => _0x4c4ec9.json());
  const _0x1632c3 = fetch("assets/skins/skins.json").then(_0xca965 => _0xca965.json());
  Promise.all([_0x5d6a09, _0x1632c3]).then(([_0x4083ad, _0x3a4592]) => {
    callback92(_0x4083ad);
    const _0x57ada2 = (_0x4abeb0, _0x3526d4) => {
      let imageAssetSet = new ImageAssetSet(_0x4abeb0);
      let svgAssetSet = new SvgAssetSet(_0x4abeb0, _0x3526d4, "assets/skins/", _0x3a4592);
      const gameSkinManager = new GameSkinManager(imageAssetSet, svgAssetSet, 1);
      return gameSkinManager;
    };
    const schemeCycler = new SchemeCycler(BotScoreLabel);
    const achievementStore = new AchievementStore([]);
    achievementStore.load();
    const _0x117e4e = callback81(_0x2ed33d, callback93(), _0x57ada2, new NamePool(_0x113767, Math.random()), schemeCycler, achievementStore);
    window.paperio2api = _0x117e4e;
    callback18(createElement(_0x1d032c, {
      api: _0x117e4e,
      storage: _0x480125,
      skins: _0x3a4592
    }), document.getElementById("game"));
  });
})();