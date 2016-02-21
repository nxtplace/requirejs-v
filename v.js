/*
 * require.v.js
 *
 * A requirejs plugin that wraps content in a define call
 *   and loads all required modules so you can use the 
 *   synchronous require('lib') in the code.
 * It also includes the "module" dependency so you can use module.exports = ...
 * This plugin uses a simple regex to find the require calls, so 
 *   that does mean that all dependencies are loaded with the module
 * Note that the current version doesn't understand comments
 *   so a commented define or require call will confuse it.
 * 
 * Copyright (c) 2015, J.B. van der Burgh
 * Licensed under the MIT license.
 */
define(['module'], function (module) {
    "use strict";
    var VERSION_NR = "0.1.4";
    var debug = false;
    var isArray = Array.isArray;
    if (!isArray) {
        isArray = function (arg) {
            return Object.prototype.toString.call(arg) === '[object Array]';
        };
    }

    var pluginName = 'v',
      _log = function (type, args) {
          if (!debug) return;
          try {

              if (type == 1 && typeof (console) != 'undefined' && console.warn && console.warn.apply) {
                  //var args = arguments;
                  Array.prototype.unshift.call(args, "W: ");
                  console.warn.apply(console, args);
              } else if (typeof (console) != 'undefined' && console.log && console.log.apply) {
                  //var args = arguments;
                  Array.prototype.unshift.call(args, "V: ");
                  console.log.apply(console, args);
              } 
          } catch (e) { }

      },
      warn = function(msg) {
          if (!debug) return;       
        _log(1, arguments);
      },
      log = function(msg) {
          if (!debug) return;
        _log(0, arguments);
      },
      normalizeRequireUrl = function (url, removeQueryString) {
          var baseParts = url.split('?'),
                            parts = baseParts[0].split('/'),
                            p, i, j;
          if (removeQueryString && baseParts.length > 1) {
              baseParts.pop();
          }
          for (i = 1; i < parts.length; i++) {
              p = parts[i];
              if (p == '.') {
                  // remove
                  //console.log('remove1 at '+i);
                  for (j = i + 1; j < parts.length; j++) {
                      parts[j - 1] = parts[j];
                  }
                  parts.pop();
                  i--;

              } else if (p == '..') {
                  if (parts[i - 1] == '..') continue;
                  if (parts[i - 1] == '.') continue;
                  // remove last part
                  //console.log('remove2 at '+i);
                  for (j = i + 1; j < parts.length; j++) {
                      parts[j - 2] = parts[j];
                  }
                  parts.pop();
                  parts.pop();
                  i -= 2;
              }
          }
          baseParts[0] = parts.join('/');
          return baseParts.join('?');
      },
      defaults = {
          debug: false,
          transformOnTheFly: true,
          noGlobalExports: false
      },
      copyToIf = function (src, dst) {
          for (var key in src) {
              if (!dst.hasOwnProperty(key)) dst[key] = src[key];
          }
          return dst;
      };

    var masterConfig = (module.config && module.config()) || {},
        toString = Object.prototype.toString,
        buildMap = {},
        isNodeBuild = (masterConfig.env === 'node' || (!masterConfig.env &&
            typeof process !== "undefined" &&
            process.versions &&
            !!process.versions.node &&
            !process.versions['node-webkit'] &&
            !process.versions['atom-shell']));
    var getNode = function (req, toLoad, onLoad, onError, replaceConfig) {
        var fs = require.nodeRequire('fs');
        var content = '', lfile;
        try {
            toLoad.forEach(function (file) {
                file = url = req.toUrl(file + '.js');
                lfile = file;

                file = fs.readFileSync(url, 'utf8');
                //Remove BOM (Byte Mark Order) from utf8 files if it is there.
                if (file[0] === '\uFEFF') {
                    file = "\n" + file.substring(1);
                } else {
                    file = "\n" + file;
                }
                // transform
                //file = v.transform(replaceConfig, file);
                content += file + "\n";
            });
            onLoad(content);
        } catch (e) {
            console.error("Error loading file " + lfile + ": " + e);
            if (onError) {
                onError(e);
            }
        }

    };
    var getBrowser = function (req, toLoad, onLoad, onError, config) {
        log("getBrowser: ", toLoad);

        req(toLoad, function (value) {
            onLoad(value);
        });
    };
    var v = {
        version: VERSION_NR,
        /* NOTE: if you want to use it, remove the "*" from the key. the name can't be present since it will generate some strange errors
        p*luginBuilder: 'v-pluginbuilder' */
        'get': isNodeBuild ? getNode : getBrowser,

        transform: function (transformConfig) {
            var shimDeps = transformConfig.dependencies || [],
             replaceConfig = transformConfig.replaceConfig,
             rawdata = transformConfig.rawdata,
             staticModuleName = transformConfig.staticModuleName,
             debugName = transformConfig.debugName || transformConfig.staticModuleName || '',
             result = transformConfig.result;
            var modules = result.modules = [],
                moduleMap = {},
                    m, mn,
                    data = rawdata;

            if (/define\s*\(/.test(data)) {
                log('transform: find dependencies ', debugName);
                var r1 = /define\s*\(\s*(['"]).+?\1\s*,\s*\[([^\]]+)\]\s*,\s*function\s*\(/g,
                    r2 = /define\s*\(\s*\[([^\]]+)\]\s*,\s*function\s*\(/g;
                var find = function (expr, index) {
                    // find dependencies used in a define(...) call
                    var re;
                    while ((m = expr.exec(data)) && m.length > 1) {
                        mn = m[index];
                        re = /^\s*(['"])(.+?)\1(\s*,\s*(['"])(.+?)\3)*\s*$/;
                        if (!re.test(mn)) continue;
                        re = /(['"])(.+?)\1/g;
                        while ((m = re.exec(mn)) && m.length > 1) {
                            m = m[2];
                            if (moduleMap[m] !== true) {
                                moduleMap[m] = true;
                                modules.push(m);
                            }
                        }
                    }
                };
                find(r1, 2);
                find(r2, 1);

            } else {
                log('transform code: ', debugName);
                // index 1=> prefix, 2 => ' or ", 3 => module

                for (var i = 0; i < shimDeps.length; i++) {
                    mn = shimDeps[i];
                    if (moduleMap[mn] !== true) {
                        modules.push(mn);
                        moduleMap[mn] = true;
                    }
                }
                var re = /([^a-zA-Z0-9\._])require\s*\(\s*(['"])([^']+)\2\s*\)/g;
                m = re.exec(data);
                while (m && m.length > 2) {
                    mn = m[3];
                    if (moduleMap[mn] !== true) {
                        modules.push(mn);
                        moduleMap[mn] = true;
                    }
                    m = re.exec(data);
                }

                //if (modules.length > 0) {

                modules.unshift('module');
                modules.unshift('require');
                var list = JSON.stringify(modules);

                data = "define(" +
                         (staticModuleName ? ('"' + staticModuleName + '", ') : '') +
                         list + ", function(require, module) { \n" +
                         (replaceConfig.noGlobalExports ? '' : "var exports = module.exports; \n") +
                         rawdata +
                         (replaceConfig.noGlobalExports ? '' : +"\nif(exports && !module.exports) { module.exports= exports; } \n") +
                         "\n});\n";
                log('found modules', modules);
                //}

                result.modules = modules;
            }
            result.data = data;
            return data;
        },
        // ---
        // Called when a dependency needs to be loaded.
        /**
        * Parses a resource name into its component parts. Resource names
        * look like: module/name.ext!strip, where the !strip part is
        * optional.
        * @param {String} name the resource name
        * @returns {Object} with properties "moduleName", "ext" and "strip"
        * where strip is a boolean.
        */
        parseName: function (name) {
            var modName, ext, temp,
                strip = false,
                index = name.lastIndexOf("."),
                isRelative = name.indexOf('./') === 0 ||
                             name.indexOf('../') === 0;

            if (index !== -1 && (!isRelative || index > 1)) {
                modName = name.substring(0, index);
                ext = name.substring(index + 1);
            } else {
                modName = name;
            }

            temp = ext || modName;
            index = temp.indexOf("!");
            if (index !== -1) {
                //Pull off the strip arg.
                strip = temp.substring(index + 1) === "strip";
                temp = temp.substring(0, index);
                if (ext) {
                    ext = temp;
                } else {
                    modName = temp;
                }
            }

            return {
                moduleName: modName,
                ext: ext,
                strip: strip
            };
        },
        load: function (name, req, onLoad, config) {
            
            var moduleName = name;
            //var parsed = v.parseName(name);
            if (!config.config.v) {
                config.config.v = {};
                //throw new Error("Require.v need to be configured");
            }

            // make a copy of the config object and inject defaults
            var replaceConfig = copyToIf(defaults, copyToIf(config.config.v, {})),
                moduleConfig = replaceConfig[name] || replaceConfig,
                toLoad = [],
                isBuild = config.isBuild,
                shouldRun = isBuild ? moduleConfig.optimize : true,
                transformOnTheFly = !isBuild && replaceConfig.transformOnTheFly,
                //pattern, value, 
                path,
                shimDependencies = [];

            // set the debug variable from config
            debug = !isBuild && replaceConfig.debug;
            log('Load: ', name);

            (function () {

                // Skip if we"re in build process and config.optimize is set to false
                //if (!shouldRun) return;

                //pattern = moduleConfig.pattern;
                //value = moduleConfig.value;
                //if( toString.call(moduleConfig.value) === "[object Function]" ) {
                //  value = moduleConfig.value();
                //}

                // skip if the `value` is contained in the ignored value list
                //if( moduleConfig.ignore && moduleConfig.ignore.indexOf( value ) >= 0 ) return;

                // If there's a `paths` config, use it
                var moduleToLoad = name;

                if (config.shim && config.shim[name] && !config.shim[pluginName + '!' + name]) {
                    // collect dependencies if the original script had a shim defined, but the plugin version doesn't
                    // e.g. this allows you to specify a shim as "bootstrap" insteadof "v!bootstrap"
                    var d = config.shim[name];
                    if (isArray(d)) {
                        shimDependencies = d;
                    } else if (d.deps && isArray(d.deps)) {
                        shimDependencies = d.deps;
                    }
                }
                if (config.shim[name]) {
                    config.shim[pluginName + '!' + name] = config.shim[name];
                }

                if (config.paths[name]) {
                    // @note: This override the defined path config to work with shimmed
                    //        modules.
                    //config.paths[name] = config.paths[name].replace(pattern, value);
                    //toLoad.push(name);

                    // we must resolve the url if we want to use the text plugin
                    //   because otherwise it will be relative to the module and 
                    //   not the "root" of the app
                    moduleToLoad = req.toUrl(name);
                    log('Load.0 ', moduleToLoad);
                    moduleToLoad = normalizeRequireUrl(moduleToLoad, true);

                    //moduleToLoad = config.paths[name];
                    log('Load.1 ', moduleToLoad);
                }
                if (!isBuild) {
                    if (transformOnTheFly) {
                        path = 'text!' + moduleToLoad + '.js';
                    } else {
                        path = 'v/' + moduleToLoad;
                        config.paths[path] = '../v/app/' + moduleToLoad;
                        //name.replace(pattern, value);
                        //path = name.replace(pattern, value);
                    }
                    log('Load.2 ', path);
                } else {
                    path = moduleToLoad;
                }

                toLoad.push(path);


            } ());
            v.get(req, toLoad, function (content) {
                var mn = moduleName; //parsed.moduleName || name;
                log("GOT ", moduleName);
                var transformConfig = {
                    debugName: pluginName + '!' + mn,
                    dependencies: shimDependencies || [],
                    replaceConfig: replaceConfig,
                    rawdata: content,
                    staticModuleName: null,
                    result: {}
                };
                if (isBuild) {
                    var meta = {};
                    transformConfig.result = meta;
                    transformConfig.staticModuleName = null;
                    content = v.transform(transformConfig);
                    buildMap[mn] = content;
                    var deps = [],
                        depMap = {};
                    var normalizeDependencyPath = function (value) {
                        //Fix relative paths in dependencies
                        //   e.g. if "v!app/module" includes "v!./file" or "text!./file"
                        //   it won't be found by the require call unless we make the paths absolute
                        if (!value || !isBuild) return value;
                        var p = value.split('!');
                        var v = p[p.length - 1];
                        if (v.indexOf('.') === 0) {
                            //normalize
                            var base = normalizeRequireUrl(name + '/../');
                            v = normalizeRequireUrl(base + v);
                            p[p.length - 1] = v;
                            value = p.join('!');
                            //log('NEW VALUE='+value)
                        }
                        return value;
                        //if (isBuild && value.indexOf('v!.') === 0) {
                        //    value = value.substr(2);
                        //    var base = normalizeRequireUrl(name + '/../');
                        //    value = 'v!' + normalizeRequireUrl(base + value);
                        //}
                        //return value;
                    };
                    transformConfig.dependencies.forEach(function (value) {
                        value = normalizeDependencyPath(value);
                        if (depMap[value] !== true) {
                            depMap[value] = true;
                            deps.push(value);
                        }
                    });
                    meta.modules.forEach(function (value) {
                        if (value == 'require' || value == 'module') return;
                        value = normalizeDependencyPath(value);

                        /*
                        if (isBuild && value.indexOf('v!')!==-1) {
                        console.log(' ');
                        console.log(value);
                        console.log(req.toUrl(value))
                        console.log(module.config())
                        throw new Error("")
                        }*/
                        if (depMap[value] !== true) {
                            depMap[value] = true;
                            deps.push(value);
                        }
                    });
                    if (deps.length === 0)
                        onLoad(content);
                    else {

                        log("Load dependencies", moduleName, deps);
                        //console.log(meta.modules)
                        // we need to require all dependencies, so they will be included in the final output
                        if (isBuild) {
                            // fix paths
                            var origToUrl = req.toUrl;
                            req.toUrl2 = function (value) {
                                //console.log('layout !!');
                                if (!value) return;
                                //console.log(value)
                                var p = value.split('!');
                                var v = p[p.length - 1];
                                if (v.indexOf('.') === 0) {
                                    //normalize
                                    var base = normalizeRequireUrl(name + '/../');
                                    v = normalizeRequireUrl(base + v);
                                    p[p.length - 1] = v;
                                    value = value.join(p);
                                }
                                return origToUrl(value);
                            };
                        }
                        req(deps, function () {
                            onLoad(content);
                        });

                    }
                } else if (transformOnTheFly) {
                    // when transforming on the fly in the browser, we need to specify the module name
                    var fullModuleName = pluginName + '!' + mn;
                    log("GOT ", fullModuleName);

                    //transformConfig.staticModuleName = fullModuleName;

                    // it appears we can simply use onload.fromText  instead of using eval
                    //  this also saves us the trouble of specifying the moduleName
                    content = v.transform(transformConfig); //fullModuleName);                    
                    //log("Transformed content \n", content);
                    if(!isBuild && mn && typeof(document) !== 'undefined' && document.location) {
                        // provide a filename
                        var murl = document.location.protocol + '//' + document.location.host;
                        murl +=  req.toUrl(mn + ".js");
                        content += "\n\n" + "//# sourceURL=" + murl;
                    }
                    //console.log(req.toUrl(mn + ".js"));
                    //console.log(normalizeRequireUrl(mn))
                    //console.log(req.toUrl());
                    try {
                        onLoad.fromText(content);
                    }catch(e) {
                        warn("Error evaluating transformed file: "+fullModuleName + ". " + e);
                        throw e;
                    }
                    /*
                    content = v.transform(replaceConfig, content, fullModuleName);
                    try {                    
                    eval.call(window, content);
                    // load the newly defined module
                    req([fullModuleName], onLoad);                        
                    } catch (e) {
                    if (onLoad.error) {
                    onLoad.error(e);
                    } else if (console && console.error) {
                    console.error('error loading module: ' + mn + ': ' + e);
                    }
                    }*/
                } else {
                    log("DONE ");
                    onLoad(content);
                }
            }, function (err) {
                if (onLoad.error) {
                    onLoad.error(err);
                }
            }, replaceConfig);
        },
        write: function (pluginName, moduleName, write, config) {

            if (buildMap.hasOwnProperty(moduleName)) {
                write.asModule(pluginName + "!" + moduleName, buildMap[moduleName]);
            }
        },

        writeFile: function (pluginName, moduleName, req, write, config) {
            /*
            var parsed = text.parseName(moduleName),
            extPart = parsed.ext ? '.' + parsed.ext : '',
            nonStripName = parsed.moduleName, // + extPart,
            //Use a '.js' file name so that it indicates it is a
            //script that can be loaded across domains.
            fileName = req.toUrl(parsed.moduleName + extPart) + '.js';
            */
            var nonStripName = moduleName,
            fileName = req.toUrl(moduleName + '.js');

            //Leverage own load() method to load plugin value, but only
            //write out values that do not have the strip argument,
            //to avoid any potential issues with ! in file names.
            v.load(nonStripName, req, function (value) {
                //Use own write() method to construct full module value.
                //But need to create shell that translates writeFile's
                //write() to the right interface.
                var textWrite = function (contents) {
                    return write(fileName, contents);
                };
                textWrite.asModule = function (moduleName, contents) {
                    return write.asModule(moduleName, fileName, contents);
                };

                v.write(pluginName, nonStripName, textWrite, config);
            }, config);
        }

    };
    return v;
});