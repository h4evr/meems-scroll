/*global define*/
define(["meems-utils", "meems-events"], function (Utils, Events) {
    "use strict";

    var activeScrollers = [];

    var transitionName = (function () {
        var b = document.body || document.documentElement;
        var transitionNames = [ "transition", "MozTransition", "WebkitTransition", "OTransition"];
        for (var i = 0; i < transitionNames.length; ++i) {
            if (transitionNames[i] in b.style) {
                return transitionNames[i];
            }
        }
        return "transition";
    }());
    
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
    
    var addEventListener = (function () {
        if (document.addEventListener) {
            return function (elm, eventName, fn) {
                elm.addEventListener(eventName, fn, false);
            };
        } else if (document.attachEvent) {
            return function (elm, eventName, fn) {
                elm.attachEvent('on' + eventName, fn);
            };
        } else {
            return function (elm, eventName, fn) {
                elm['on' + eventName] = fn;
            };
        }
    }());
    
    var removeEventListener = (function () {
        if (document.removeEventListener) {
            return function (elm, eventName, fn) {
                elm.removeEventListener(eventName, fn, false);
            };
        } else if (document.detachEvent) {
            return function (elm, eventName, fn) {
                elm.detachEvent('on' + eventName, fn);
            };
        } else {
            return function (elm, eventName) {
                elm['on' + eventName] = null;
            };
        }
    }());
        
    function registerHandlers(elm, config) {
        if (!config.disableTouchEvents) {
            addEventListener(elm, Events.touchStartEventName, onTouchStart);
            addEventListener(elm, Events.touchMoveEventName, onTouchMove);
            addEventListener(elm, Events.touchEndEventName, onTouchEnd);
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
            removeEventListener(elm, Events.touchStartEventName, onTouchStart);
            removeEventListener(elm, Events.touchMoveEventName, onTouchMove);
            removeEventListener(elm, Events.touchEndEventName, onTouchEnd);
        }
    }
    
    function getFirstParentScroller(e) {
        //var targetType = e.target.tagName.toLowerCase();
        /*if (targetType === 'button' || targetType === 'input' || targetType === 'textarea') {
            return null;
        } */
        
        var node = e.currentTarget;
        
        while (node.$meems_scroll === undefined && node.parentNode) {
            node = node.parentNode;
        }
        
        return node;
    }
    
    function calculateFinalPositionAndTime(config, fingerDownPos, fingerUpPos, currentPos,
                                            time, scrollerSize, contentSize) {
        var offsetY = fingerDownPos - fingerUpPos,
            speedY = offsetY / time,
            totalTime = Math.abs(speedY / config.friction),
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

    function onTouchStart(e) {
        var scroller = getFirstParentScroller(e);
        
        if (!scroller) {
            return true;
        }
        
        var content = scroller.$meems_content;
        scroller.$meems_content_size = getObjectDimensions(content);
        
        scroller.$meems_old_pos = {
            x: scroller.$meems_content_size.left,
            y: scroller.$meems_content_size.top
        };
        
        content.style[transitionName] = "";
        
        scroller.$meems_dragging = true;
        scroller.$meems_dragging_start = (new Date()).getTime();
        scroller.$meems_cursor_pos = Events.getCursorPosition(e);
        scroller.$meems_cursor_last_pos = scroller.$meems_cursor_pos;
        scroller.$meems_scrolling_running_animation = false;
        scroller.$meems_drag_distance = 0;
        scroller.$meems_effective_drag_distance = 0;
        scroller.$meems_locked_axis = undefined;
        
        ++$scrollersDragging;

        return true;
        //return cancelEvent(e);
    }
    
    function onTouchMove(e) {
        if ($scrollersDragging <= 0) {
            return true;
        }
        
        var scroller = getFirstParentScroller(e);
        if (!scroller || !scroller.$meems_dragging) {
            return true;
        }
                
        var config = scroller.$meems_config,
            newPos = Events.getCursorPosition(e),
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
        
        var content = scroller.$meems_content,
            //style = content.style,
            posX, posY;
        
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
        updateScrollbar(scroller, content);
        
        if (e.preventDefault) {
            e.preventDefault();
        }
        
        return true;
    }
    
    function onTouchEnd(e) {
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
            time = ((new Date()).getTime() - scroller.$meems_dragging_start) / 1000.0;
        
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

        return true;
        //return cancelEvent(e);
    }
    
    function scrollAux(scroller, finalXPos, finalXPosTime, finalYPos, finalYPosTime) {
        var config = scroller.$meems_config,
            content = scroller.$meems_content,
            transitionRule = "";

        if (config.scrollY) {
            transitionRule = "top " + finalYPosTime + "s " + config.timingFunction;
        }
        
        if (config.scrollX) {
            if (config.scrollY) {
                transitionRule  += ", ";
            }
            
            transitionRule += "left " + finalXPosTime + "s " + config.timingFunction;
        }

        if (transitionRule.length > 0) {
            content.style[transitionName] = transitionRule;
            
            window.requestAnimationFrame(function () {
                //var style = content.style;
                var time = 0;
                
                if (finalYPos !== undefined) {
                    //style.top = (typeof finalYPos === 'string' ? finalYPos : finalYPos + "px");
                    time = Math.max(time, finalYPosTime);
                }
                
                if (finalXPos !== undefined) {
                    //style.left = (typeof finalXPos === 'string' ? finalXPos : finalXPos + "px");
                    time = Math.max(time, finalXPosTime);
                }
                
                setContentPos(scroller, finalXPos, finalYPos);
                
                if (time > 0) {
                    touchEndScrollbarAnimation(scroller, time);
                    Utils.postPone(function () {
                        scroller.$meems_handler.fire("scroll:end", -(finalXPos || 0), -(finalYPos || 0));
                    });
                }
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
        elm.appendChild(elm.$meems_scrollbar_y);
    }
    
    function createHorizontalScrollBar(elm, config) {
        if (config.hideScroller) {
            return;
        }
        elm.$meems_scrollbar_x = document.createElement("div");
        elm.$meems_scrollbar_x.className = "ui-scroll-bar-x";
        elm.$meems_scrollbar_x.style.position = "absolute";
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
    
    function updateScrollbar(scroller, content) {
        var config = scroller.$meems_config;
        
        if (config.hideScroller) {
            return;
        }
        
        if (config.scrollY) {
            var scrollbarY = scroller.$meems_scrollbar_y,
                scrollerHeight = scroller.$meems$elm_size.height,
                contentHeight = scroller.$meems_content_size.height,
                verticalBarH = (Math.min(scrollerHeight, contentHeight) / contentHeight) * scrollerHeight,
                verticalBarY = (-content.offsetTop / contentHeight) * scrollerHeight;
            
            scrollbarY.style.top = verticalBarY + "px";
            scrollbarY.style.height = verticalBarH + "px";
        }
        
        if (config.scrollX) {
            var scrollbarX = scroller.$meems_scrollbar_x,
                scrollerWidth = scroller.$meems$elm_size.width,
                contentWidth = scroller.$meems_content_size.width,
                verticalBarW = (Math.min(scrollerWidth, contentWidth) / contentWidth) * scrollerWidth,
                verticalBarX = (-content.offsetLeft / contentWidth) * scrollerWidth;
            
            scrollbarX.style.left = verticalBarX + "px";
            scrollbarX.style.width = verticalBarW + "px";
        }
    }
    
    var setContentPos = function (scroller, left, top) {
        if (typeof(left) === 'number') {
            scroller.$meems_content.style.left = left + "px";
            scroller.$meems_content_size.left = left;
        }
        
        if (typeof(top) === 'number') {
            scroller.$meems_content.style.top = top + "px";
            scroller.$meems_content_size.top = top;
        }
    };
    
    var getObjectDimensions = function (el) {
        return {
            left: el.offsetLeft,
            top: el.offsetTop,
            width: el.offsetWidth,
            height: el.offsetHeight
        };
    };

    function Scroll(elm, config) {
        Events.Handler.apply(this, arguments); // super
        
        config = config || {};
        config.friction = config.friction || 1000.0;
        config.totalMaxTime = config.totalMaxTime || 1;
        config.totalMaxTimesnap = config.totalMaxTimesnap || 0;
        config.paging = config.paging === true;
        config.snap = config.snap === true;
        config.scrollY = config.scrollY !== false;
        config.scrollX =  config.scrollX === true;
        config.timingFunction = config.timingFunction || "ease-out";
        config.fadeOutDuration = config.fadeOutDuration || 1;
        config.bouncing = config.bouncing !== false;
        config.minDistanceOfDrag = config.minDistanceOfDrag || 500;
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
    
    Scroll.updateAll = function () {
        var scroller;
        for (var i = 0, ln = activeScrollers.length; i < ln; ++i) {
            scroller = activeScrollers[i];
            scroller.update();
            //scroller.scrollTo(scroller.$elm.$meems_content_size.left, scroller.$elm.$meems_content_size.top);
        }
    };
    
    Scroll.extend(Events.Handler, {
        update : function () {
            this.$elm.$meems$elm_size = getObjectDimensions(this.$elm);
            this.$elm.$meems_content_size = getObjectDimensions(this.$elm.$meems_content);
            updateScrollbar(this.$elm, this.$elm.$meems_content);
        },
        
        destroy : function () {
            activeScrollers.splice(activeScrollers.indexOf(this), 0);
            removeHandlers(this.$elm, this.$meems_config);
        },
        
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
    
    return Scroll;
});
