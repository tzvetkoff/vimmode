//
// VimMode - Kill your mouse!
// Author: Latchezar Tzvetkoff <http://tzvetkoff.net/>
//

(function() {
  // whether the "hints mode" is active or not
  var hintsModeActive = false;

  // whether we need to open the link in a new tab
  var shiftKey = false;

  // current combo as string
  var currentCombo = '';

  // key-value of navigatable elements (combo => element)
  var hintedElements = {};

  // navigatable elements count
  var hintedElementsCount = 0;

  // key-value of hints (combo => element)
  var hints = {};

  // combo charset
  var comboCharset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  // combo charset length
  var comboCharsetLength = comboCharset.length;

  // nice string util
  var strStartsWith = function(str, what) {
    return str.slice(0, what.length) === what;
  };

  // the combo generator
  var generateCombo = function(index, length) {
    if (length <= comboCharsetLength) {
      return comboCharset[index];
    }
    if (length <= comboCharsetLength * comboCharsetLength) {
      return comboCharset[parseInt(index / comboCharsetLength)] + comboCharset[index % comboCharsetLength];
    }
    if (length <= comboCharset.length * comboCharset.length * comboCharset.length) {
      return comboCharset[parseInt(index / (comboCharsetLength * comboCharsetLength))] + comboCharset[parseInt(index / comboCharsetLength) % comboCharsetLength] + comboCharset[index % comboCharsetLength];
    }
  };

  var comboHtml = function(combo) {
    if (currentCombo.length && strStartsWith(combo, currentCombo)) {
      return '<span class="vimmode_internal_hint_hi">' + currentCombo + '</span>' + combo.slice(currentCombo.length);
    }

    return combo;
  };

  var buildHints = function(hintableElements, elementPositions) {
    hintableElements.forEach(function(element, index) {
      var combo = generateCombo(index, hintedElementsCount);
      var hint = hintVerbatim.cloneNode(false);
      hint.innerHTML = comboHtml(combo);
      hint.style.left = elementPositions[index].left + 'px';
      hint.style.top = elementPositions[index].top + 'px';
      hintsContainer.appendChild(hint);

      hintedElements[combo] = element;
      hints[combo] = hint;
    });
  };

  var updateHints = function() {
    var found = false;

    for (var key in hints) {
      if (hints.hasOwnProperty(key)) {
        var hint = hints[key];
        hint.style.display = 'inline';
        hint.innerHTML = comboHtml(key);

        if (strStartsWith(key, currentCombo)) {
          found = true;
        } else if (settings.hideNonMatchingHints) {
          hint.style.display = 'none';
        }
      }
    }

    if (!found) {
      leaveHintsMode();
    }
  };

  // checks if element is *really* visible
  var elementVisible = function(element) {
    var docBody = document.body;
    do {
      if (!element || !element.style || element.style.display == 'none' || element.style.visibility == 'hidden') {
        return false;
      }
      element = element.parentNode;
    } while (element && element != docBody);

    return true;
  };

  // some fast caches
  var bodyScrollLeft = 0, bodyScrollTop = 0, windowInnerWidth = 0, windowInnerHeight = 0;

  // checks whether an position is inside the current visible area
  var positionInsideVisibleArea = function(position) {
    return !settings.visibleElementsOnly ||
      (position.top  >= bodyScrollTop  && position.top  <= bodyScrollTop  + windowInnerHeight &&
       position.left >= bodyScrollLeft && position.left <= bodyScrollLeft + windowInnerWidth);
  };

  // returns element absolute position in the document
  var getElementPosition = function(element) {
    var e = element, valueT = 0, valueL = 0, docBody = document.body;

    do {
      valueT += e.offsetTop  || 0;
      valueL += e.offsetLeft || 0;
      if (e.offsetParent == docBody && e.style.position == 'absolute') {
        break;
      }
    } while (e = e.offsetParent);

    e = element;
    do {
      if (e != docBody) {
        valueT -= e.scrollTop  || 0;
        valueL -= e.scrollLeft || 0;
      }
    } while (e = e.parentNode);

    return { left: valueL, top: valueT };
  };

  // fires an event over the element - used to simulate clicks
  var fireEvent = function(element, name, memo, bubble) {
    if (typeof bubble == 'undefined') {
      bubble = true;
    }

    var event = document.createEvent('HTMLEvents');

    if (name.indexOf(':') != -1) {
      event.initEvent('dataavailable', bubble, true);
    } else {
      event.initEvent(name, bubble, true);
    }

    event.eventName = name;
    event.memo = memo || {};

    element.dispatchEvent(event);
  };

  // eats focused elements
  var consumeFocus = function() {
    if (document.activeElement && document.activeElement.blur) {
      document.activeElement.blur();
    }
  };

  // the hints container
  var hintsContainer = document.createElement('div');
  hintsContainer.className = 'vimmode_internal_container';

  // the hint element verbatim
  var hintVerbatim = document.createElement('span');
  hintVerbatim.className = 'vimmode_internal_hint';

  // the warning container
  var warningContainer = document.createElement('span');
  warningContainer.className = 'vimmode_internal_warning';

  // the warning container hide timeout
  var warningTimeout = null;

  // show a nice warning
  var showWarning = function(message) {
    warningContainer.innerHTML = message;

    warningContainer.style.display = 'none';
    warningContainer.style.opacity = 1.0;
    warningContainer.style.display = 'inline';

    if (!warningContainer.parentNode) {
      document.body.appendChild(warningContainer);
    }

    if (warningTimeout) {
      clearTimeout(warningTimeout);
    }

    warningTimeout = setTimeout(function() {
      warningContainer.style.opacity = 0.0;
      warningTimeout = null;
    }, 2048);
  };

  // enters hints mode
  var enterHintsMode = function() {
    // eat it!
    consumeFocus();

    // set mode and reset internal variables
    hintsModeActive = true;
    currentCombo = '';
    hintedElements = {};
    hints = {};

    // get elements and quickly filter out hidden ones
    var hintableElements = Array.prototype.slice.call(document.querySelectorAll('a[href], textarea, input:not([type="hidden"]), button, select, [onclick]'));
    hintableElements = hintableElements.filter(elementVisible);

    // cache some variables
    bodyScrollLeft = document.body.scrollLeft;
    bodyScrollTop = document.body.scrollTop;
    windowInnerWidth = window.innerWidth;
    windowInnerHeight = window.innerHeight;

    // leave only onscreen elements if configured
    var elementPositions = [];
    if (settings.visibleElementsOnly) {
      hintableElements = hintableElements.filter(function(element) {
        var position = getElementPosition(element);

        if (positionInsideVisibleArea(position)) {
          elementPositions.push(position);
          return true;
        }

        return false;
      })
    } else {
      elementPositions = hintableElements.map(getElementPosition);
    }

    // store count
    hintedElementsCount = hintableElements.length;

    // if no elements found - show a nice warning and bail
    if (!hintedElementsCount) {
      leaveHintsMode();
      showWarning('No hintable elements found');
      return;
    }

    // if count exceeds limit - bail
    if (hintedElementsCount > comboCharsetLength * comboCharsetLength * comboCharsetLength) {
      leaveHintsMode();
      showWarning('Too many hintable elements');
      return;
    }

    // build hints
    buildHints(hintableElements, elementPositions);

    // cycle through elements and add hints

    // add hints container to body if not already added
    if (!hintsContainer.parentNode) {
      document.body.appendChild(hintsContainer);
    }

    // finally, show container
    hintsContainer.style.display = 'block';
  };

  // leaves hints mode
  var leaveHintsMode = function() {
    hintsModeActive = false;
    hints = {};
    hintsContainer.style.display = 'none';
    hintsContainer.innerHTML = '';
  };

  // triggers action over element
  var triggerElement = function(element) {
    switch (element.tagName) {
      case 'A':
        if (shiftKey && element.href.indexOf('javascript:') != 0) {
          safari.self.tab.dispatchMessage('openTab', element.href);
        } else {
          fireEvent(element, 'click');
        }
        break;

      case 'INPUT':
        if (element.type == 'checkbox' || element.type == 'radio') {
          element.checked = !element.checked;
        } else if (element.type == 'button' || element.type == 'submit' || element.type == 'reset') {
          element.click();
        } else {
          element.focus();
        }
        break;

      case 'TEXTAREA':
        element.focus();
        break;

      case 'BUTTON':
        element.click();
        break;

      case 'SELECT':
        var event = document.createEvent('MouseEvents');
        event.initMouseEvent('mousedown', true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        element.dispatchEvent(event);
        break;

      default:
        fireEvent(element, 'click');
        break;
    }

    leaveHintsMode();
  };

  // stops event from propagating
  var stopEvent = function(event) {
    event.preventDefault();
    event.stopPropagation();
    return false;
  };

  // start with default settings
  var settings = {
    hintsModeModifier       : 'ctrlKey',
    hintsModeKey            : 'F',
    hintsModeKeyCode        : 70,
    hideNonMatchingHints    : true,

    visibleElementsOnly     : true,
    openTabsInBackground    : true,
    bubbleBobble            : false,
    comboCharset            : 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',

    scrollDownHalfModifier  : 'ctrlKey',
    scrollDownHalfKey       : 'J',
    scrollDownHalfKeyCode   : 74,

    scrollUpHalfModifier    : 'ctrlKey',
    scrollUpHalfKey         : 'K',
    scrollUpHalfKeyCode     : 75,

    scrollDownFullModifier  : 'ctrlKey',
    scrollDownFullKey       : 'N',
    scrollDownFullKeyCode   : 78,

    scrollUpFullModifier    : 'ctrlKey',
    scrollUpFullKey         : 'M',
    scrollUpFullKeyCode     : 77,

    nextTabModifier         : 'ctrlKey',
    nextTabKey              : 'I',
    nextTabKeyCode          : 73,

    prevTabModifier         : 'ctrlKey',
    prevTabKey              : 'U',
    prevTabKeyCode          : 85,

    switchTabModifier       : 'altKey',
    consumeFocus            : false
  };

  // #pragma once
  var once = true;

  // the message handler that recieves settings
  safari.self.addEventListener('message', function(event) {
    switch (event.name) {
      case 'setSettings':
        settings = event.message;
        comboCharset = settings.comboCharset;
        comboCharsetLength = comboCharset.length;

        if (once) {
          once = false;
          hookKeyDown();
        }

        break;
    }
  }, false);

  // get settings
  safari.self.tab.dispatchMessage('getSettings');

  // check if element or some of its parents has contenteditable="true"
  var elementEditable = function(element) {
    do {
      if (element.contentEditable == 'true' || element.tagName == 'INPUT' || element.tagName == 'TEXTAREA') {
        return true;
      }
    } while (element = element.parentNode);

    return false;
  };

  // hook keyboard once we receive settings
  var hookKeyDown = function() {
    // the magic - hook key events
    document.addEventListener('keydown', function(event) {
      // do nothing if we're inside an editable element
      if (document.activeElement && elementEditable(document.activeElement)) {
        return;
      }

      var keyCode = event.keyCode;

      // if hints mode is active, we do more
      if (hintsModeActive) {
        // if esc is pressed we leave hints mode
        if (keyCode == 27) {
          leaveHintsMode();
          return stopEvent(event);
        }

        // if no modifier keys are hold, go combo
        if (!event.ctrlKey && !event.altKey && !event.metaKey && keyCode >= 65 && keyCode <= 90) {
          shiftKey = shiftKey || event.shiftKey;
          currentCombo += String.fromCharCode(keyCode);
          currentCombo = currentCombo.slice(hintedElementsCount <= comboCharsetLength ? -1 : hintedElementsCount <= comboCharsetLength * comboCharsetLength ? -2 : -3);
          updateHints();

          var element = hintedElements[currentCombo];
          if (element) {
            triggerElement(element);
          }
          return stopEvent(event);
        }

        // handle backspace
        if (!event.ctrlKey && !event.altKey && !event.metaKey && keyCode == 8) {
          currentCombo = currentCombo.slice(0, currentCombo.length - 1);
          updateHints();

          return stopEvent(event);
        }

        // hide hints when meta key is hold
        if (event.metaKey && !event.ctrlKey && !event.altKey && keyCode == 91) {
          hintsContainer.style.display = 'none';

          return stopEvent(event);
        }
      }

      // we only want to handle mod-key & mod-shift-key
      if (event[settings.hintsModeModifier] && !event.metaKey && keyCode == settings.hintsModeKeyCode) {
        shiftKey = event.shiftKey;
        if (!hintsModeActive) {
          enterHintsMode();
        }
        return stopEvent(event);
      }

      // scroll down half
      if (event[settings.scrollDownHalfModifier] && !event.metaKey && keyCode == settings.scrollDownHalfKeyCode) {
        window.scrollBy(0, window.innerHeight / 2);
        return stopEvent(event);
      }
      // scroll up half
      if (event[settings.scrollUpHalfModifier] && !event.metaKey && keyCode == settings.scrollUpHalfKeyCode) {
        window.scrollBy(0, -window.innerHeight / 2);
        return stopEvent(event);
      }

      // scroll down full
      if (event[settings.scrollDownFullModifier] && !event.metaKey && keyCode == settings.scrollDownFullKeyCode) {
        window.scrollBy(0, window.innerHeight);
        return stopEvent(event);
      }
      // scroll up full
      if (event[settings.scrollUpFullModifier] && !event.metaKey && keyCode == settings.scrollUpFullKeyCode) {
        window.scrollBy(0, -window.innerHeight);
        return stopEvent(event);
      }

      // next tab
      if (event[settings.nextTabModifier] && !event.metaKey && keyCode == settings.nextTabKeyCode) {
        safari.self.tab.dispatchMessage('nextTab');
        return stopEvent(event);
      }
      // prev tab
      if (event[settings.prevTabModifier] && !event.metaKey && keyCode == settings.prevTabKeyCode) {
        safari.self.tab.dispatchMessage('prevTab');
        return stopEvent(event);
      }

      // alt+number tab switching
      if (event[settings.switchTabModifier] && !event.metaKey && keyCode >= 48 && keyCode <= 57) {
        if (keyCode == 48) {
          safari.self.tab.dispatchMessage('lastTab');
        } else {
          safari.self.tab.dispatchMessage('gotoTab', keyCode - 49);
        }
        return stopEvent(event);
      }
    }, settings.bubbleBobble);
  };

  // we can blur focused elements only when document is fully loaded
  document.addEventListener('DOMContentLoaded', function() {
    // consume focus if needed
    if (settings.consumeFocus) {
      if (!/www\.google\.[a-z]{2,}/.test(location.href)) {
        setTimeout(consumeFocus, 128);  // 0 timeout is sometimes just not enough
      }
    }
  }, false);

  // show hints again when meta key is released
  document.addEventListener('keyup', function() {
    if (hintsModeActive) {
      if (event.keyIdentifier == 'Meta') {
        hintsContainer.style.display = 'block';
      }
    }
  }, false);

  // leave hints mode on click
  document.addEventListener('click', function() {
    if (hintsModeActive) {
      leaveHintsMode();
    }
  }, false);

  // and on context menu
  document.addEventListener('contextmenu', function() {
    if (hintsModeActive) {
      leaveHintsMode();
    }
  }, false);
})();
