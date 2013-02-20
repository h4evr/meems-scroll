define(["meems-utils", "meems-events"], function (Utils, Events) {
    var touchStartEventName, touchEndEventName, touchMoveEventName;
    var getCursorPosition;
    
    if ('ontouchstart' in window) {
        touchStartEventName = 'touchstart';
        touchMoveEventName = 'touchmove';
        touchEndEventName = 'touchend';
        getCursorPosition = function (e) {
            return {
                x : e.touches[0].pageX,
                y : e.touches[0].pageY
            };
        };
    } else {
        touchStartEventName = 'mousedown';
        touchMoveEventName = 'mousemove';
        touchEndEventName = 'mouseup';
        getCursorPosition = function (e) {
            return {
                x : e.pageX,
                y : e.pageY
            };
        };
    }
    
    var transitionName = (function() {
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
     
    (function() {
        var lastTime = 0;
        var vendors = ['ms', 'moz', 'webkit', 'o'];
        for(var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
            window.requestAnimationFrame = window[vendors[x]+'RequestAnimationFrame'];
            window.cancelAnimationFrame = window[vendors[x]+'CancelAnimationFrame']
                                       || window[vendors[x]+'CancelRequestAnimationFrame'];
        }
     
        if (!window.requestAnimationFrame) {
            window.requestAnimationFrame = function(callback, element) {
                var currTime = new Date().getTime();
                var timeToCall = Math.max(0, 16 - (currTime - lastTime));
                var id = window.setTimeout(function() { callback(currTime + timeToCall); },
                  timeToCall);
                lastTime = currTime + timeToCall;
                return id;
            };
        }
     
        if (!window.cancelAnimationFrame) {
            window.cancelAnimationFrame = function(id) {
                clearTimeout(id);
            };
        }
    }());
    
    var addEventListener = (function() {
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
    
    var removeEventListener = (function() {
        if (document.removeEventListener) {
            return function (elm, eventName, fn) {
                elm.removeEventListener(eventName, fn, false);
            };
        } else if (document.detachEvent) {
            return function (elm, eventName, fn) {
                elm.detachEvent('on' + eventName, fn);
            };
        } else {
            return function (elm, eventName, fn) {
                elm['on' + eventName] = null;
            };
        }
    }());
        
    function registerHandlers(elm, config) {
        addEventListener(elm, touchStartEventName, onTouchStart);
        addEventListener(elm, touchMoveEventName, onTouchMove);
        addEventListener(elm, touchEndEventName, onTouchEnd);
        
        elm._meems_scroll = true;
        elm._meems_config = config;
        
        elm.style.overflow = 'hidden';
        elm.children[0].style.position = 'absolute';
    }
    
    function removeHandlers(elm) {
        delete elm._meems_scroll;
        delete elm._meems_config;
        removeEventListener(elm, touchStartEventName, onTouchStart);
        removeEventListener(elm, touchMoveEventName, onTouchMove);
        removeEventListener(elm, touchEndEventName, onTouchEnd);
    }
    
    function cancelEvent(e) {
        if (e.preventDefault) {
            e.preventDefault();
        }
        
        if (e.cancelBubble !== undefined) {
            e.cancelBubble = true;
        }
        
        if (e.returnValue !== undefined) {
            e.returnValue = false;
        }
        
        return false;
    }
    
    function getFirstParentScroller(e) {
        var targetType = e.target.tagName.toLowerCase();
        if (targetType === 'button' || targetType === 'input' || targetType === 'textarea') {
            return null;
        } 
        
        var node = e.currentTarget;
        
        while (node._meems_scroll === undefined && node.parentNode) {
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
        if (finalPos != newFinalPositionY) {
            totalTime = totalTime * Math.abs((fingerDownPos - newFinalPositionY) / (fingerDownPos - finalPos));
            finalPos = newFinalPositionY;
        }
        
        if (totalTime > config.totalMaxTime) {
            totalTime = config.totalMaxTime;
        }
        
        return [finalPos, totalTime];
    }
    
    var _scrollersDragging = 0; 
    function onTouchStart(e) {
        var scroller = getFirstParentScroller(e);
        
        if (!scroller) {
            return true;
        }
        
        var content = scroller.children[0];
        
        scroller._meems_old_pos = {
            x: content.offsetLeft,
            y: content.offsetTop
        };
        
        content.style[transitionName] = "";
        
        scroller._meems_dragging = true;
        scroller._meems_dragging_start = (new Date()).getTime();
        scroller._meems_cursor_pos = getCursorPosition(e);
        scroller._meems_cursor_last_pos = scroller._meems_cursor_pos;
        scroller._meems_scrolling_running_animation = false;
        scroller._meems_drag_distance = 0;
        scroller._meems_effective_drag_distance = 0;
        scroller._meems_locked_axis = undefined;
        
        ++_scrollersDragging;
        
        //return cancelEvent(e);
    }
    
    function onTouchMove(e) {
        if (_scrollersDragging <= 0) {
            return true;
        }
        
        var scroller = getFirstParentScroller(e);
        if (!scroller || !scroller._meems_dragging) {
            return true;
        }    
                
        var config = scroller._meems_config,
            newPos = getCursorPosition(e),
            offsetX = scroller._meems_cursor_pos.x - newPos.x,
            offsetY = scroller._meems_cursor_pos.y - newPos.y;
            
        if (scroller._meems_drag_distance < config.minDistanceOfDrag) {
            scroller._meems_drag_distance += offsetX * offsetX + offsetY * offsetY;
            return true;
        } else if (config.axisLock && scroller._meems_locked_axis === undefined) {
            scroller._meems_locked_axis = (offsetX * offsetX > offsetY * offsetY ? 'x' : 'y');
        }
        
        var content = scroller.children[0],
            style = content.style;
        
        if (config.scrollX && (scroller._meems_locked_axis === 'x' || scroller._meems_locked_axis === undefined)) {
            var posX = scroller._meems_old_pos.x - offsetX;
            
            if (!config.bouncing) {
                if (posX > 0) {
                    posX = 0;
                } else if (posX < -scroller.children[0].offsetWidth + scroller.offsetWidth) {
                    posX = -scroller.children[0].offsetWidth + scroller.offsetWidth;
                }
            }
            
            scroller._meems_effective_drag_distance += offsetX * offsetX;
            style.left = posX + "px";
            scroller._meems_scrollbar_x.style.display = 'block';
        }
        
        if (config.scrollY && (scroller._meems_locked_axis === 'y' || scroller._meems_locked_axis === undefined)) {
            var posY = scroller._meems_old_pos.y - offsetY;
            
            if (!config.bouncing) {
                if (posY > 0) {
                    posY = 0;
                } else if (posY < -scroller.children[0].offsetHeight + scroller.offsetHeight) {
                    posY = -scroller.children[0].offsetHeight + scroller.offsetHeight;
                }
            }
            
            scroller._meems_effective_drag_distance += offsetY * offsetY;
            style.top = posY + "px";
            scroller._meems_scrollbar_y.style.display = 'block';
        }
        
        scroller._meems_cursor_last_pos = newPos;
        
        updateScrollbar(scroller, content);
        
        //return cancelEvent(e);
    }
    
    function onTouchEnd(e) {        
        var scroller = getFirstParentScroller(e);
        if (!scroller || !scroller._meems_dragging) {
            return true;
        } 
        
        --_scrollersDragging;
        scroller._meems_dragging = false;
        
        var config = scroller._meems_config;
        
        if (scroller._meems_effective_drag_distance < config.minDistanceOfDrag) {
            return true;
        }
            
        var content = scroller.children[0],
            newPos = scroller._meems_cursor_last_pos,
            time = ((new Date()).getTime() - scroller._meems_dragging_start) / 1000.0;
        
        var finalY, finalYPos, finalYPosTime,
            finalX, finalXPos, finalXPosTime;
        
        if (config.scrollY) {
            var scrollerHeight = scroller.offsetHeight,
                contentHeight = scroller.children[0].offsetHeight;
            
            finalY = calculateFinalPositionAndTime(config, scroller._meems_cursor_pos.y, newPos.y, content.offsetTop, time, scrollerHeight, contentHeight);
            finalYPos = finalY[0];
            finalYPosTime = finalY[1];
            finalY = null;
        }
        
        if (config.scrollX) {
            var scrollerWidth = scroller.offsetWidth,
                contentWidth = scroller.children[0].offsetWidth;
            
            finalX = calculateFinalPositionAndTime(config, scroller._meems_cursor_pos.x, newPos.x, content.offsetLeft, time, scrollerWidth, contentWidth);
            finalXPos = finalX[0];
            finalXPosTime = finalX[1];
            finalX = null;
        }
        
        scrollAux(scroller, finalXPos, finalXPosTime, finalYPos, finalYPosTime);
        
        //return cancelEvent(e);
    }
    
    function scrollAux(scroller, finalXPos, finalXPosTime, finalYPos, finalYPosTime) {
        var config = scroller._meems_config,
            content = scroller.children[0],
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
        
        Utils.postPone(function() {
            var pX = (finalXPos !== undefined ? -finalXPos : undefined),
                pY = (finalYPos !== undefined ? -finalYPos : undefined);
            scroller._meems_handler.fire("scroll:end", pX, pY);
        });
        
        if (transitionRule.length > 0) {
            content.style[transitionName] = transitionRule;
            
            Utils.postPone(function() {
                var style = content.style;
                var time = 0;
                
                if (finalYPos !== undefined) {
                    style.top = finalYPos + "px";
                    time = Math.max(time, finalYPosTime);
                }
                
                if (finalXPos !== undefined) {
                    style.left = finalXPos + "px";
                    time = Math.max(time, finalXPosTime);
                }
                
                if (time > 0) {                    
                    touchEndScrollbarAnimation(scroller, time);
                }
            });
        }
    }
    
    function createVerticalScrollBar(elm) {   
        elm._meems_scrollbar_y = document.createElement("div");
        elm._meems_scrollbar_y.className = "ui-scroll-bar-y";
        elm._meems_scrollbar_y.style.position = "absolute";
        elm.appendChild(elm._meems_scrollbar_y);
    }
    
    function createHorizontalScrollBar(elm) {
        elm._meems_scrollbar_x = document.createElement("div");
        elm._meems_scrollbar_x.className = "ui-scroll-bar-x";
        elm._meems_scrollbar_x.style.position = "absolute";
        elm.appendChild(elm._meems_scrollbar_x);
    }
    
    function touchEndScrollbarAnimation(scroller, totalTime) {               
        var content = scroller.children[0],
            scrollbarX = scroller._meems_scrollbar_x,
            scrollbarY = scroller._meems_scrollbar_y,
            totalMs = totalTime * 1000.0,
            start = (new Date()).getTime(), lastFrame,
            fadeOutDuration = scroller._meems_config.fadeOutDuration * 1000.0,
            startOp, op,
            interval;
        
        scroller._meems_scrolling_running_animation = true;

        function fadeOut() {            
            var timestamp = (new Date()).getTime();
            
            op -= interval * (timestamp - lastFrame) / 1000.0;
            
            scrollbarX && (scrollbarX.style.opacity = op);
            scrollbarY && (scrollbarY.style.opacity = op);
            
            if (scroller._meems_scrolling_running_animation && timestamp - start < fadeOutDuration) {
                lastFrame = timestamp;
                window.requestAnimationFrame(fadeOut);
            } else {
                scrollbarX && (scrollbarX.style.display = 'none') && (scrollbarX.style.opacity = startOp);
                scrollbarY && (scrollbarY.style.display = 'none') && (scrollbarY.style.opacity = startOp);
                
                scroller._meems_scrolling_running_animation = false;
            }
        }
        
        function req() {
            var timestamp = (new Date()).getTime();
            
            updateScrollbar(scroller, content);
            
            if (scroller._meems_scrolling_running_animation && timestamp - start < totalMs) {
                window.requestAnimationFrame(req);
            } else {
                startOp = 
                     (scrollbarX && document.defaultView.getComputedStyle(scrollbarX, null).opacity) || 
                     (scrollbarY && document.defaultView.getComputedStyle(scrollbarY, null).opacity) || 1.0;
                op = startOp + 0.0;
                interval = startOp / fadeOutDuration * 1000.0;
                lastFrame = start = (new Date()).getTime();
                window.requestAnimationFrame(fadeOut);
            }
        }
        
        window.requestAnimationFrame(req);
    }
    
    function updateScrollbar(scroller, content) {
        var config = scroller._meems_config;
        
        if (config.scrollY) {
            var scrollbarY = scroller._meems_scrollbar_y,
                scrollerHeight = scroller.offsetHeight * 1.0,
                contentHeight = content.offsetHeight,
                verticalBarH = (Math.min(scrollerHeight, contentHeight) / contentHeight) * scrollerHeight,
                verticalBarY = (-content.offsetTop / contentHeight) * scrollerHeight;
            
            scrollbarY.style.top = verticalBarY + "px";
            scrollbarY.style.height = verticalBarH + "px";
        }
        
        if (config.scrollX) {
            var scrollbarX = scroller._meems_scrollbar_x,
                scrollerWidth = scroller.offsetWidth,
                contentWidth = content.offsetWidth,
                verticalBarW = (Math.min(scrollerWidth, contentWidth) / contentWidth) * scrollerWidth,
                verticalBarX = (-content.offsetLeft / contentWidth) * scrollerWidth;
            
            scrollbarX.style.left = verticalBarX + "px";
            scrollbarX.style.width = verticalBarW + "px";
        }
    }

    function Scroll(elm, config) {
        Events.Handler.apply(this, arguments); // super
        
        config = config || {};
        config.friction = config.friction || 1000.0;
        config.totalMaxTime = config.totalMaxTime || 1;
        config.totalMaxTimesnap = config.totalMaxTimesnap || 0;
        config.paging = config.paging === true;
        config.scrollY = config.scrollY === false ? false : true;
        config.scrollX =  config.scrollX === true;
        config.timingFunction = config.timingFunction || "ease-out";
        config.fadeOutDuration = config.fadeOutDuration || 1;
        config.bouncing = config.bouncing === false ? false : true;
        config.minDistanceOfDrag = config.minDistanceOfDrag || 500;
        config.axisLock = config.axisLock === false ? false : true;
        
        registerHandlers(elm, config);
        
        if (config.scrollY) {
            createVerticalScrollBar(elm);
        }
        
        if (config.scrollX) {
            createHorizontalScrollBar(elm);
        }
        
        this._elm = elm;
        this._elm._meems_handler = this;
        
        return this;
    }
    
    Scroll.extend(Events.Handler, {
        update : function () {
            updateScrollbar(this._elm, this._elm.children[0]);
        },
        
        scrollTo : function (x, y, duration) {
            duration = duration || 0.25;
            
            if (this._elm._meems_config.scrollY) {
                this._elm._meems_scrollbar_y.style.display = 'block';
            }
            
            if (this._elm._meems_config.scrollX) {
                this._elm._meems_scrollbar_x.style.display = 'block';
            }
            
            scrollAux(this._elm, -x, duration, -y, duration);
        }
    });
    
    return Scroll;
});