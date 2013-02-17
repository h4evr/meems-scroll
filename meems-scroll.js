define(function () {
    var config = {
        friction: 1000.0,
        totalMaxTime: 1,
        snap: 0,
        paging: false,
        scrollY: true,
        scrollX: false
    };
    
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
        
    function registerHandlers(elm) {
        addEventListener(elm, touchStartEventName, onTouchStart);
        addEventListener(elm, touchMoveEventName, onTouchMove);
        addEventListener(elm, touchEndEventName, onTouchEnd);
        elm._meems_scroll = true;
        elm.style.overflow = 'hidden';
        
        elm.children[0].style.position = 'absolute';
    }
    
    function removeHandlers(elm) {
        delete elm._meems_scroll;
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
        var node = e.target;
        
        while (node._meems_scroll === undefined && node.parentNode) {
            node = node.parentNode;
        }
        
        return node;
    }
    
    function onTouchStart(e) {
        var scroller = getFirstParentScroller(e);
        
        scroller._meems_old_pos = {
            x: scroller.children[0].offsetLeft,
            y: scroller.children[0].offsetTop
        };
        
        scroller.children[0].style[transitionName] = "";
        
        scroller._meems_dragging = true;
        scroller._meems_dragging_start = (new Date()).getTime();
        scroller._meems_cursor_pos = getCursorPosition(e);
        
        return cancelEvent(e);
    }
    
    function onTouchMove(e) {
        var scroller = getFirstParentScroller(e);
        
        if (!scroller._meems_dragging) {
            return;
        }
        
        var newPos = getCursorPosition(e),
            offsetX = scroller._meems_cursor_pos.x - newPos.x,
            offsetY = scroller._meems_cursor_pos.y - newPos.y,
            style = scroller.children[0].style;
        
        if (config.scrollX) {
            style.left = (scroller._meems_old_pos.x - offsetX) + "px";
        }
        
        if (config.scrollY) {
            style.top = (scroller._meems_old_pos.y - offsetY) + "px";
        }
        
        scroller._meems_cursor_last_pos = newPos;
        
        return cancelEvent(e);
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
    
    function onTouchEnd(e) {
        var scroller = getFirstParentScroller(e),
            content = scroller.children[0],
            newPos = scroller._meems_cursor_last_pos,
            time = ((new Date()).getTime() - scroller._meems_dragging_start) / 1000.0;
        
        var finalY, finalYPos, finalYPosTime,
            finalX, finalXPos, finalXPosTime;
        
        var transitionRule = "";
        
        if (config.scrollY) {
            var scrollerHeight = scroller.offsetHeight,
                contentHeight = scroller.children[0].offsetHeight;
            
            finalY = calculateFinalPositionAndTime(config, scroller._meems_cursor_pos.y, newPos.y, content.offsetTop, time, scrollerHeight, contentHeight);
            finalYPos = finalY[0];
            finalYPosTime = finalY[1];
            finalY = null;
            
            transitionRule = "top " + finalYPosTime + "s";
        }
        
        if (config.scrollX) {
            var scrollerWidth = scroller.offsetWidth,
                contentWidth = scroller.children[0].offsetWidth;
            
            finalX = calculateFinalPositionAndTime(config, scroller._meems_cursor_pos.x, newPos.x, content.offsetLeft, time, scrollerWidth, contentWidth);
            finalXPos = finalX[0];
            finalXPosTime = finalX[1];
            finalX = null;
            
            if (config.scrollY) {
                transitionRule  += ", ";
            }
            
            transitionRule += "left " + finalXPosTime + "s";
        }
        
        scroller._meems_dragging = false;
        
        if (transitionRule.length > 0) {
            content.style[transitionName] = transitionRule;
        
            setTimeout(function() {
                var style = content.style;
                
                if (finalYPos !== undefined) {
                    style.top = finalYPos + "px";
                }
                
                if (finalXPos !== undefined) {
                    style.left = finalXPos + "px";
                }
            }, 10);
            
            return cancelEvent(e);
        } else {
            return true;
        }
    }

    function Scroll(elm) {
        registerHandlers(elm);
        return this;
    }
    
    return Scroll;
});