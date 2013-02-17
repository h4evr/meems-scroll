define(function () {
    var config = {
        friction: 2500.0,
        transitionY: "top 10s"
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
            //offsetX = scroller._meems_cursor_pos.x - newPos.x,
            offsetY = scroller._meems_cursor_pos.y - newPos.y;
        
        //scroller.children[0].style.left = (scroller._meems_old_pos.x - offsetX) + "px";
        scroller.children[0].style.top = (scroller._meems_old_pos.y - offsetY) + "px";
        
        scroller._meems_cursor_last_pos = newPos;
        
        return cancelEvent(e);
    }
    
    function onTouchEnd(e) {
        var scroller = getFirstParentScroller(e);
        
        var newPos = scroller._meems_cursor_last_pos,
            offsetY = scroller._meems_cursor_pos.y - newPos.y,
            time = ((new Date()).getTime() - scroller._meems_dragging_start) / 1000.0,
            speedY = offsetY / time,
            totalTime = Math.abs(speedY / config.friction),
            finalY = scroller.children[0].offsetTop - speedY * totalTime;
        
        var scrollerHeight = scroller.offsetHeight;
        var contentHeight = scroller.children[0].offsetHeight;
        
        var newFinalPositionY = finalY;
        if (contentHeight < scrollerHeight) {
            if (newFinalPositionY < 0) {
                newFinalPositionY = 0;
            }
        } else {
            if (newFinalPositionY < -contentHeight + scrollerHeight) {
                newFinalPositionY = -contentHeight + scrollerHeight;
            }
        }
        
        if (newFinalPositionY > 0) {
            newFinalPositionY = 0;
        }
        
        // recalculate time
        if (finalY != newFinalPositionY) {
            totalTime = totalTime * Math.abs((scroller.children[0].offsetTop - newFinalPositionY) / (scroller.children[0].offsetTop - finalY));
            finalY = newFinalPositionY;
        }
        
        scroller._meems_dragging = false;
        scroller.children[0].style[transitionName] = "top " + totalTime + "s";
    
        setTimeout(function() {
            scroller.children[0].style.top = finalY + "px";
        }, 10);
        
        return cancelEvent(e);
    }
    
    function Scroll(elm) {
        registerHandlers(elm);
        return this;
    }
    
    return Scroll;
});