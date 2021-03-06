/*global define*/
/**
 * Emulates scrolling on a set of components, with scroll-bars, as if on a mobile environment.
 * @module meems-scroll
 * @requires meems-utils
 * @requires meems-events
 */
define(["meems-utils", "meems-events"], function (Utils, Events) {
    "use strict";

    var activeScrollers = [];

    var transitionName = (function () {
        var b = document.body || document.documentElement;
        var transitionNames = [ "transition", "MozTransition", "WebkitTransition", "OTransition", "MsTransition"];

        for (var i = 0; i < transitionNames.length; ++i) {
            if (transitionNames[i] in b.style) {
                return transitionNames[i];
            }
        }
        return "transition";
    }());

    var transformObj = (function () {
        var b = document.body || document.documentElement,
            transformNames = [ "transform", "MozTransform", "WebkitTransform" ],
            ret = {
                cssName: "transition",
                jsName: "transition"
            };

        for (var i = 0; i < transformNames.length; ++i) {
            if (transformNames[i] in b.style) {
                ret.cssName = transformNames[i];
                ret.jsName = ret.cssName.substring(0, 1).toLowerCase() + ret.cssName.substring(1);
                break;
            }
        }

        return ret;
    }()),
        transformName = transformObj.cssName,
        transformNameJs = transformObj.jsName;

    transformObj = null;

    // requestAnimationFrame polyfill by Erik Möller
    // fixes from Paul Irish and Tino Zijdel
     
    (function () {
        var lastTime = 0;
        var vendors = ['ms', 'moz', 'webkit', 'o'];
        for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
            window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
            window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame']
                                       || window[vendors[x] + 'CancelRequestAnimationFrame'];
        }
     
        if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = function (callback/*, element*/) {
                var currTime = new Date().getTime();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function () { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }
     
        if (!window.cancelAnimationFrame) {
            window.cancelAnimationFrame = function (id) {
                clearTimeout(id);
            };
        }
    }());
        
    function registerHandlers(elm, config) {
        if (!config.disableTouchEvents) {
            Events.Dom.on(elm, Events.Touch.touchStartEventName, onTouchStart);
            Events.Dom.on(elm, Events.Touch.touchMoveEventName, onTouchMove);
            Events.Dom.on(elm, Events.Touch.touchEndEventName, onTouchEnd);
        }
        
        elm.$meems_scroll = true;
        elm.$meems_config = config;
        
        elm.style.overflow = 'hidden';
        elm.$meems_content.style.position = 'absolute';
    }
    
    function removeHandlers(elm, config) {
        delete elm.$meems_scroll;
        delete elm.$meems_config;
        
        if (!config.disableTouchEvents) {
            Events.Dom.off(elm, Events.Touch.touchStartEventName, onTouchStart);
            Events.Dom.off(elm, Events.Touch.touchMoveEventName, onTouchMove);
            Events.Dom.off(elm, Events.Touch.touchEndEventName, onTouchEnd);
        }
    }
    
    function getFirstParentScroller(e) {
        //var targetType = e.target.tagName.toLowerCase();
        /*if (targetType === 'button' || targetType === 'input' || targetType === 'textarea') {
            return null;
        } */
        
        var node = e.target;

        if (node.className.indexOf("meems-scroll-skip") > -1) {
            return null;
        }
        
        while (node.$meems_scroll === undefined && node.parentNode) {
            node = node.parentNode;
        }
        
        return node;
    }
    
    function calculateFinalPositionAndTime(config, fingerDownPos, fingerUpPos, currentPos,
                                            time, scrollerSize, contentSize) {
        var offsetY = fingerDownPos - fingerUpPos,
            speedY = offsetY / time,
            totalTime = time / config.friction, //Math.abs(speedY / config.friction),
            finalPos = currentPos - speedY * totalTime;

        if (config.paging) {
            if (finalPos > currentPos + scrollerSize) {
                finalPos = currentPos + scrollerSize;
            } else if (finalPos < currentPos - scrollerSize) {
                finalPos = currentPos - scrollerSize;
            }
            
            finalPos = Math.round(finalPos / scrollerSize) * scrollerSize;
        } else if (config.snap && config.snap > 0) {
            finalPos = Math.round(finalPos / config.snap) * config.snap;
        }

        var newFinalPositionY = finalPos;

        if (contentSize < scrollerSize) {
            if (newFinalPositionY < 0) {
                newFinalPositionY = 0;
            }
        } else {
            if (newFinalPositionY < -contentSize + scrollerSize) {
                newFinalPositionY = -contentSize + scrollerSize;
            }
        }
        
        if (newFinalPositionY > 0) {
            newFinalPositionY = 0;
        }
        
        // recalculate time
        if (finalPos !== newFinalPositionY) {
            totalTime = totalTime * Math.abs((fingerDownPos - newFinalPositionY) / (fingerDownPos - finalPos));
            finalPos = newFinalPositionY;
        }

        if (totalTime > config.totalMaxTime) {
            totalTime = config.totalMaxTime;
        }

        return [finalPos, totalTime];
    }
    
    var $scrollersDragging = 0;
    var $mouseIsDown = false;

    function onDocumentTouchStart() {
        $mouseIsDown = true;
    }

    function onDocumentTouchEnd() {
        $mouseIsDown = false;
    }

    function onTouchStart(e) {
        var scroller = getFirstParentScroller(e);

        if (!scroller) {
            return true;
        }

        var content = scroller.$meems_content,
            oldX = (scroller.$meems_content_size ? scroller.$meems_content_size.left || 0 : 0),
            oldY = (scroller.$meems_content_size ? scroller.$meems_content_size.top || 0 : 0);

        content.style[transitionName] = "";

        scroller.$meems_content_size = getObjectDimensions(content);
        scroller.$meems$elm_size = getObjectDimensions(scroller);

        scroller.$meems_content_size.left = oldX;
        scroller.$meems_content_size.top = oldY;

        scroller.$meems_old_pos = {
            x: scroller.$meems_content_size.left,
            y: scroller.$meems_content_size.top
        };

        scroller.$meems_dragging = true;
        scroller.$meems_dragging_start = (new Date()).getTime();
        scroller.$meems_cursor_pos = Events.Touch.getCursorPosition(e);
        scroller.$meems_cursor_last_pos = scroller.$meems_cursor_pos;
        scroller.$meems_scrolling_running_animation = false;
        scroller.$meems_drag_distance = 0;
        scroller.$meems_effective_drag_distance = 0;
        scroller.$meems_locked_axis = undefined;

        ++$scrollersDragging;

        updateScrollbarsSize(scroller);

        return true;
        //return cancelEvent(e);
    }

    function scrollUpOrDownAccordingToEvent(e) {
        if (!$mouseIsDown) {
            return;
        }

        var scroller = getFirstParentScroller(e);
        if (!scroller) {
            return;
        }

        var content = scroller.$meems_content,
            oldX = (scroller.$meems_content_size ? scroller.$meems_content_size.left || 0 : 0),
            oldY = (scroller.$meems_content_size ? scroller.$meems_content_size.top || 0 : 0);

        scroller.$meems_content_size = getObjectDimensions(content);
        scroller.$meems_content_size.left = oldX;
        scroller.$meems_content_size.top = oldY;

        var pos = Events.Touch.getCursorPosition(e),
            config = scroller.$meems_config,
            scrollerPosition = Utils.Dom.getPosition(scroller),
            scrollerHeight = scroller.$meems$elm_size.height,
            contentHeight = scroller.$meems_content_size.height;

        if (config.scrollY) {
            var dir = 0;

            if (pos.y - scrollerPosition.y <= 100) {
                dir = 50;
            } else if (scrollerPosition.y + scrollerHeight - pos.y <= 100) {
                dir = -50;
            }

            if (dir !== 0) {
                var finalY = calculateFinalPositionAndTime({
                        paging: false,
                        snap: false,
                        totalMaxTime: 0.50,
                        friction: config.friction
                    }, 0, dir, scroller.$meems_content_size.top, 0.50, scrollerHeight, contentHeight),
                    finalYPos = finalY[0],
                    finalYPosTime = finalY[1];

                scrollAux(scroller, null, null, finalYPos, finalYPosTime);
            }
        }
    }

    function onTouchMove(e) {
        if (!$mouseIsDown || $scrollersDragging <= 0) {
            scrollUpOrDownAccordingToEvent(e);
            return true;
        }
        
        var scroller = getFirstParentScroller(e);
        if (!scroller || !scroller.$meems_dragging) {
            scrollUpOrDownAccordingToEvent(e);
            return true;
        }
                
        var config = scroller.$meems_config,
            newPos = Events.Touch.getCursorPosition(e),
            offsetX = scroller.$meems_cursor_pos.x - newPos.x,
            offsetY = scroller.$meems_cursor_pos.y - newPos.y;
            
        if (scroller.$meems_drag_distance < config.minDistanceOfDrag) {
            scroller.$meems_drag_distance += offsetX * offsetX + offsetY * offsetY;
            if (e.preventDefault) {
                e.preventDefault();
            }
            return true;
        } else if (config.axisLock && scroller.$meems_locked_axis === undefined) {
            scroller.$meems_locked_axis = (offsetX * offsetX > offsetY * offsetY ? 'x' : 'y');
        }

        var posX, posY;
        
        if (config.scrollX && (scroller.$meems_locked_axis === 'x' || scroller.$meems_locked_axis === undefined)) {
            posX = scroller.$meems_old_pos.x - offsetX;
            
            if (!config.bouncing) {
                if (posX > 0) {
                    posX = 0;
                } else if (posX < -scroller.$meems_content_size.width + scroller.$meems$elm_size.width) {
                    posX = -scroller.$meems_content_size.width + scroller.$meems$elm_size.width;
                }
            }
            
            scroller.$meems_effective_drag_distance += offsetX * offsetX;
            //style.left = posX + "px";
            if (!config.hideScroller) {
                scroller.$meems_scrollbar_x.style.display = 'block';
            }
        }
        
        if (config.scrollY && (scroller.$meems_locked_axis === 'y' || scroller.$meems_locked_axis === undefined)) {
            posY = scroller.$meems_old_pos.y - offsetY;
            
            if (!config.bouncing) {
                if (posY > 0) {
                    posY = 0;
                } else if (posY < -scroller.$meems_content_size.height + scroller.$meems$elm_size.height) {
                    posY = -scroller.$meems_content_size.height + scroller.$meems$elm_size.height;
                }
            }
            
            scroller.$meems_effective_drag_distance += offsetY * offsetY;
            //style.top = posY + "px";
            if (!config.hideScroller) {
                scroller.$meems_scrollbar_y.style.display = 'block';
            }
        }
        
        setContentPos(scroller, posX, posY);
        
        scroller.$meems_cursor_last_pos = newPos;
        fastUpdateScrollbar(scroller, posX, posY);
        
        if (e.preventDefault) {
            e.preventDefault();
        }

        return true;
    }
    
    function onTouchEnd(e) {
        $mouseIsDown = false;

        var scroller = getFirstParentScroller(e);
        if (!scroller || !scroller.$meems_dragging) {
            return true;
        }
        
        --$scrollersDragging;
        scroller.$meems_dragging = false;
        
        var config = scroller.$meems_config;
        
        if (scroller.$meems_effective_drag_distance < config.minDistanceOfDrag) {
            return true;
        }
            
        var newPos = scroller.$meems_cursor_last_pos,
            time = Math.min(2.0, ((new Date()).getTime() - scroller.$meems_dragging_start) / 1000.0);
        
        var finalY, finalYPos, finalYPosTime,
            finalX, finalXPos, finalXPosTime;
        
        if (config.scrollY) {
            var scrollerHeight = scroller.$meems$elm_size.height,
                contentHeight = scroller.$meems_content_size.height;

            finalY = calculateFinalPositionAndTime(config, scroller.$meems_cursor_pos.y, newPos.y, scroller.$meems_old_pos.y, time, scrollerHeight, contentHeight);
            finalYPos = finalY[0];
            finalYPosTime = finalY[1];
            finalY = null;
        }
        
        if (config.scrollX) {
            var scrollerWidth = scroller.$meems$elm_size.width,
                contentWidth = scroller.$meems_content_size.width;
            
            finalX = calculateFinalPositionAndTime(config, scroller.$meems_cursor_pos.x, newPos.x, scroller.$meems_old_pos.x, time, scrollerWidth, contentWidth);
            finalXPos = finalX[0];
            finalXPosTime = finalX[1];
            finalX = null;
        }
        
        scrollAux(scroller, finalXPos, finalXPosTime, finalYPos, finalYPosTime);

        if (e.preventDefault) {
            e.preventDefault();
        }

        if (e.stopPropagation) {
            e.stopPropagation();
        }

        if (e.cancelBubble !== undefined) {
            e.cancelBubble = true;
        }

        return false;
    }
    
    function scrollAux(scroller, finalXPos, finalXPosTime, finalYPos, finalYPosTime) {
        var config = scroller.$meems_config,
            content = scroller.$meems_content,
            maxTime = Math.max(finalXPosTime || 0, finalYPosTime || 0),
            transitionRule = "all " + maxTime + "s " + config.timingFunction;

        if (maxTime > 0) {
            content.style[transitionName] = transitionRule;

            window.requestAnimationFrame(function () {
                setContentPos(scroller, finalXPos, finalYPos);

                touchEndScrollbarAnimation(scroller, maxTime);
                Utils.Fn.postPone(function () {
                    scroller.$meems_handler.fire("scroll:end", -(finalXPos || 0), -(finalYPos || 0));
                });
            });
        }
    }
    
    function createVerticalScrollBar(elm, config) {
        if (config.hideScroller) {
            return;
        }
        elm.$meems_scrollbar_y = document.createElement("div");
        elm.$meems_scrollbar_y.className = "ui-scroll-bar-y";
        elm.$meems_scrollbar_y.style.position = "absolute";
        elm.$meems_scrollbar_y.style.display = 'none';
        elm.appendChild(elm.$meems_scrollbar_y);
    }
    
    function createHorizontalScrollBar(elm, config) {
        if (config.hideScroller) {
            return;
        }
        elm.$meems_scrollbar_x = document.createElement("div");
        elm.$meems_scrollbar_x.className = "ui-scroll-bar-x";
        elm.$meems_scrollbar_x.style.position = "absolute";
        elm.$meems_scrollbar_x.style.display = 'none';
        elm.appendChild(elm.$meems_scrollbar_x);
    }
    
    function touchEndScrollbarAnimation(scroller, totalTime) {
        var content = scroller.$meems_content,
            scrollbarX = scroller.$meems_scrollbar_x,
            scrollbarY = scroller.$meems_scrollbar_y,
            totalMs = totalTime * 1000.0,
            start = (new Date()).getTime(), lastFrame,
            fadeOutDuration = scroller.$meems_config.fadeOutDuration * 1000.0,
            startOp, op,
            interval;
        
        scroller.$meems_scrolling_running_animation = true;

        function fadeOut() {
            var timestamp = (new Date()).getTime();
            op -= interval * (timestamp - lastFrame);

            if (scrollbarX) {
                scrollbarX.style.opacity = op;
            }
            
            if (scrollbarY) {
                scrollbarY.style.opacity = op;
            }
            
            if (scroller.$meems_scrolling_running_animation && timestamp - start < fadeOutDuration) {
                lastFrame = timestamp;
                window.requestAnimationFrame(fadeOut);
            } else {
                if (scrollbarX) {
                    scrollbarX.style.display = 'none';
                    scrollbarX.style.opacity = startOp;
                }

                if (scrollbarY) {
                    scrollbarY.style.display = 'none';
                    scrollbarY.style.opacity = startOp;
                }
                
                scroller.$meems_scrolling_running_animation = false;
            }
        }
        
        function req() {
            var timestamp = (new Date()).getTime();
            
            updateScrollbar(scroller, content);
            
            if (scroller.$meems_scrolling_running_animation && timestamp - start < totalMs) {
                window.requestAnimationFrame(req);
            } else {
                startOp =
                     (scrollbarX && document.defaultView.getComputedStyle(scrollbarX, null).opacity) ||
                     (scrollbarY && document.defaultView.getComputedStyle(scrollbarY, null).opacity) || 1.0;
                op = startOp;
                interval = startOp / fadeOutDuration;
                lastFrame = start = (new Date()).getTime();
                window.requestAnimationFrame(fadeOut);
            }
        }
        
        window.requestAnimationFrame(req);
    }

    var matrixPattern = /[\-\d\.]+, [\-\d\.]+, [\-\d\.]+, [\-\d\.]+, ([\-\d\.]+), ([\-\d\.]+)/;

    function updateScrollbar(scroller, content) {
        var config = scroller.$meems_config;
        
        if (config.hideScroller) {
            return;
        }

        var animPos = (function () {
            var style = document.defaultView.getComputedStyle(content, null), m;

            if ((m = style[transformNameJs].match(matrixPattern)) !== null) {
                return {
                    left : parseFloat(m[1]),
                    top: parseFloat(m[2])
                };
            } else {
                return {
                    left : scroller.$meems_content_size.left,
                    top: scroller.$meems_content_size.top
                };
            }
        }());

        if (config.scrollY) {
            var scrollbarY = scroller.$meems_scrollbar_y,
                scrollerHeight = scroller.$meems$elm_size.height,
                contentHeight = scroller.$meems_content_size.height,
                verticalBarY = (-animPos.top / contentHeight) * scrollerHeight;

            scrollbarY.style[transformName] = "translate3d(0,"+verticalBarY+"px,0)";
        }
        
        if (config.scrollX) {
            var scrollbarX = scroller.$meems_scrollbar_x,
                scrollerWidth = scroller.$meems$elm_size.width,
                contentWidth = scroller.$meems_content_size.width,
                verticalBarX = (-animPos.left / contentWidth) * scrollerWidth;

            scrollbarX.style[transformName] = "translate3d(" +  verticalBarX + "px,0,0)";
        }
    }

    function updateScrollbarsSize(scroller) {
        var config = scroller.$meems_config;

        if (config.hideScroller) {
            return;
        }

        if (config.scrollY) {
            var scrollerHeight = scroller.$meems$elm_size.height,
                contentHeight = scroller.$meems_content_size.height,
                verticalBarH = (Math.min(scrollerHeight, contentHeight) / contentHeight) * scrollerHeight;

            scroller.$meems_scrollbar_y.style.height = verticalBarH + "px";
        }

        if (config.scrollX) {
            var scrollbarX = scroller.$meems_scrollbar_x,
                scrollerWidth = scroller.$meems$elm_size.width,
                contentWidth = scroller.$meems_content_size.width,
                verticalBarW = (Math.min(scrollerWidth, contentWidth) / contentWidth) * scrollerWidth;

            scrollbarX.style.width = verticalBarW + "px";
        }
    }

    function fastUpdateScrollbar(scroller, x, y) {
        var config = scroller.$meems_config;

        if (config.hideScroller) {
            return;
        }

        if (config.scrollY) {
            var scrollbarY = scroller.$meems_scrollbar_y,
                scrollerHeight = scroller.$meems$elm_size.height,
                contentHeight = scroller.$meems_content_size.height,
                verticalBarY = (-y / contentHeight) * scrollerHeight;

            //scrollbarY.style.top = verticalBarY + "px";
            scrollbarY.style[transformName] = "translate3d(0,"+verticalBarY+"px,0)";
        }

        if (config.scrollX) {
            var scrollbarX = scroller.$meems_scrollbar_x,
                scrollerWidth = scroller.$meems$elm_size.width,
                contentWidth = scroller.$meems_content_size.width,
                verticalBarX = (-x / contentWidth) * scrollerWidth;

            //scrollbarX.style.left = verticalBarX + "px";
            scrollbarX.style[transformName] = "translate3d(" +  verticalBarX + "px,0,0)";
        }
    }
    
    var setContentPos = function (scroller, left, top) {
        var l = left === undefined ? scroller.$meems_content_size.left || 0 : left || 0,
            t = top === undefined ? scroller.$meems_content_size.top || 0 : top || 0;

        scroller.$meems_content.style[transformName] = "translate3d(" +  l + "px," + t + "px, 0)";
        scroller.$meems_content_size.left = l;
        scroller.$meems_content_size.top = t;
    };
    
    var getObjectDimensions = function (el) {
        return {
            left: el.offsetLeft,
            top: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight
        };
    };

    /**
     * @class Scroll
     * @constructor
     */
    function Scroll(elm, config) {
        Events.Handler.apply(this, arguments); // super
        
        config = config || {};
        config.friction = config.friction || 0.2;
        config.totalMaxTime = config.totalMaxTime || 1;
        config.paging = config.paging === true;
        config.snap = config.snap || 0;
        config.scrollY = config.scrollY !== false;
        config.scrollX =  config.scrollX === true;
        config.timingFunction = config.timingFunction || "ease-out";
        config.fadeOutDuration = config.fadeOutDuration || 1;
        config.bouncing = config.bouncing !== false;
        config.minDistanceOfDrag = config.minDistanceOfDrag || 10;
        config.axisLock = config.axisLock !== false;
        config.disableTouchEvents = config.disableTouchEvents === true;
        config.hideScroller = config.hideScroller === true;
        
        elm.$meems_content = elm.children[0];
        registerHandlers(elm, config);
        
        if (config.scrollY) {
            createVerticalScrollBar(elm, config);
        }
        
        if (config.scrollX) {
            createHorizontalScrollBar(elm, config);
        }
        
        this.$elm = elm;
        this.$elm.$meems_handler = this;
        this.$elm.$meems$elm_size = getObjectDimensions(this.$elm);
        this.$elm.$meems_content_size = getObjectDimensions(this.$elm.$meems_content);
        
        activeScrollers.push(this);
        
        return this;
    }

    /**
     * Updates all scroller that were ever created and are still active.
     * @method updateAll
     * @static
     */
    Scroll.updateAll = function () {
        var scroller;
        for (var i = 0, ln = activeScrollers.length; i < ln; ++i) {
            scroller = activeScrollers[i];
            scroller.update();
            //scroller.scrollTo(scroller.$elm.$meems_content_size.left, scroller.$elm.$meems_content_size.top);
        }
    };
    
    Scroll.extend(Events.Handler, {
        /**
         * Update the size of the scroller, should be called after a layout change.
         *
         * @method update
         */
        update : function () {
            this.$elm.$meems$elm_size = getObjectDimensions(this.$elm);
            this.$elm.$meems_content_size = getObjectDimensions(this.$elm.$meems_content);
            updateScrollbar(this.$elm, this.$elm.$meems_content);
        },

        /**
         * Destroy this scroller instance.
         *
         * @method destroy
         */
        destroy : function () {
            activeScrollers.splice(activeScrollers.indexOf(this), 0);
            removeHandlers(this.$elm, this.$meems_config);
        },

        /**
         * Scroll to the given position, with animation.
         *
         * @method scrollTo
         * @param {Number} x What x coordinate should be at the left-top corner after scrolling.
         * @param {Number} [y] What y coordinate should be at the left-top corner after scrolling.
         * @param {Number} [duration] How long the animation should last.
         */
        scrollTo : function (x, y, duration) {
            duration = duration || 0.25;
            
            if (!this.$elm.$meems_config.hideScroller) {
                if (this.$elm.$meems_config.scrollY) {
                    this.$elm.$meems_scrollbar_y.style.display = 'block';
                }
                
                if (this.$elm.$meems_config.scrollX) {
                    this.$elm.$meems_scrollbar_x.style.display = 'block';
                }
            }
            
            scrollAux(this.$elm, -x, duration, -y, duration);
        }
    });

    Events.Dom.on(document, Events.Touch.touchStartEventName, onDocumentTouchStart);
    Events.Dom.on(document, Events.Touch.touchEndEventName, onDocumentTouchEnd);

    return Scroll;
});
