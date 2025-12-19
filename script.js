// Constants
const SCROLL_THRESHOLD = 10;
const SWIPE_THRESHOLD = 45;
const SWIPE_MAX_DURATION = 600;
const LABEL_HIDE_DELAY = 300;
const INTERSECTION_THRESHOLD = 0.7;
const SCROLL_TRIGGER_RATIO = 0.5;
const RESIZE_DEBOUNCE_DELAY = 150;
const TRANSLATION_TOGGLE_UPDATE_DELAY = 100;
const SCROLL_INDICATOR_HIDE_THRESHOLD = 100;
const MOBILE_WIDTH_THRESHOLD = 700;
const MOBILE_LANDSCAPE_WIDTH_THRESHOLD = 1000;
const MOBILE_LANDSCAPE_HEIGHT_THRESHOLD = 500;
const MOBILE_SCROLL_OFFSET = 20;
const SCROLL_INDICATOR_OFFSET = 60;

// DOM elements - validated at initialization
let notebook;
let pagesContainer;
let prevBtn;
let nextBtn;

// State
let pages = [];
let currentPage = 0;
let poems = [];
let scrollIndicatorHidden = false;
let resizeTimeout = null;
let isMobileDeviceCache = null;
let cachedWindowWidth = null;
let cachedWindowHeight = null;
let cachedTouchSupport = null;

// Event handlers for cleanup
const eventHandlers = {
  keyboard: null,
  scroll: null,
  resize: null,
  scrollIndicator: null,
  coverClick: null,
  scrollHide: null
};

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Utility: Normalize line endings
function normalizeLineEndings(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

// Split text into stanzas (paragraphs separated by blank lines)
function splitIntoStanzas(text) {
  if (typeof text !== 'string') return [];
  
  const normalized = normalizeLineEndings(text);
  return normalized
    .split(/\n\s*\n+/) // Split on one or more newlines with optional whitespace
    .map(stanza => stanza.trim())
    .filter(stanza => stanza.length > 0);
}

// Format a single stanza (convert single newlines to <br /> tags)
function formatStanza(stanza) {
  if (typeof stanza !== 'string') return '';
  
  const lines = stanza
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  // Escape each line and join with <br />
  return lines.map(line => escapeHtml(line)).join('<br />');
}

// Convert newlines to <br /> tags, preserving paragraph breaks (for non-grid layout)
function formatText(text) {
  if (typeof text !== 'string') return '';
  
  const normalized = normalizeLineEndings(text);
  const lines = normalized.split('\n');
  const result = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isEmpty = line.trim() === '';
    const prevLine = i > 0 ? lines[i - 1] : null;
    const prevWasEmpty = prevLine ? prevLine.trim() === '' : false;
    
    if (isEmpty) {
      // Only add one break for consecutive empty lines (paragraph break)
      if (!prevWasEmpty && result.length > 0) {
        result.push('<br />');
      }
    } else {
      // Add break before this line if there was a previous line
      if (result.length > 0) {
        result.push('<br />');
      }
      result.push(escapeHtml(line));
    }
  }
  
  return result.join('');
}

// Get current scroll position (replaces deprecated pageYOffset)
function getScrollTop() {
  return window.scrollY ?? document.documentElement.scrollTop ?? 0;
}

// Helper function to detect mobile devices (cached for performance)
function isMobileDevice() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  
  // Use cache if dimensions haven't changed
  if (isMobileDeviceCache !== null && 
      cachedWindowWidth === width && 
      cachedWindowHeight === height) {
    return isMobileDeviceCache;
  }
  
  cachedWindowWidth = width;
  cachedWindowHeight = height;
  
  if (cachedTouchSupport === null) {
    cachedTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  }
  
  // Portrait mobile: width <= 700px
  // Landscape mobile: width <= 1000px AND height <= 500px AND touch device
  isMobileDeviceCache = width <= MOBILE_WIDTH_THRESHOLD || 
    (width <= MOBILE_LANDSCAPE_WIDTH_THRESHOLD && 
     height <= MOBILE_LANDSCAPE_HEIGHT_THRESHOLD && 
     cachedTouchSupport);
  
  return isMobileDeviceCache;
}

// Invalidate mobile device cache on resize
function invalidateMobileCache() {
  isMobileDeviceCache = null;
  cachedWindowWidth = null;
  cachedWindowHeight = null;
}

// Render poems into pages
function renderPoems() {
  if (!pagesContainer) {
    console.error('Pages container not found');
    return;
  }
  
  pagesContainer.innerHTML = '';
  pages = [];

  poems.forEach((poem, index) => {
    const page = document.createElement('article');
    page.className = 'page translation-visible';
    if (index === 0) page.classList.add('active');
    page.setAttribute('data-page', index + 1);
    page.setAttribute('aria-label', `Poem ${index + 1}: ${poem.title}`);

    const pageContent = document.createElement('div');
    pageContent.className = 'page-content';

    const header = document.createElement('header');
    const h2 = document.createElement('h2');
    h2.textContent = poem.title;
    header.appendChild(h2);
    
    // Add translated title if available
    if (poem.titleTranslation) {
      const h3 = document.createElement('h3');
      h3.className = 'title-translation';
      h3.textContent = poem.titleTranslation;
      header.appendChild(h3);
    }

    const poemBody = document.createElement('div');
    poemBody.className = 'poem-body';

    // Split both texts into stanzas
    const originalStanzas = splitIntoStanzas(poem.original);
    const translationStanzas = splitIntoStanzas(poem.translation);
    
    // Determine the maximum number of stanzas to ensure we have matching pairs
    const maxStanzas = Math.max(originalStanzas.length, translationStanzas.length);
    
    // Create a grid container for stanza pairs
    const stanzaGrid = document.createElement('div');
    stanzaGrid.className = 'stanza-grid';
    
    // Create rows for each stanza pair
    for (let i = 0; i < maxStanzas; i++) {
      const stanzaRow = document.createElement('div');
      stanzaRow.className = 'stanza-row';
      
      // Original stanza cell
      const originalCell = document.createElement('div');
      originalCell.className = 'stanza-cell original';
      if (i < originalStanzas.length) {
        originalCell.innerHTML = formatStanza(originalStanzas[i]);
      } else {
        // Add empty cell if original has fewer stanzas
        originalCell.innerHTML = '&nbsp;';
      }
      stanzaRow.appendChild(originalCell);
      
      // Translation stanza cell
      const translationCell = document.createElement('div');
      translationCell.className = 'stanza-cell translation';
      if (i < translationStanzas.length) {
        translationCell.innerHTML = formatStanza(translationStanzas[i]);
      } else {
        // Add empty cell if translation has fewer stanzas
        translationCell.innerHTML = '&nbsp;';
      }
      stanzaRow.appendChild(translationCell);
      
      stanzaGrid.appendChild(stanzaRow);
    }
    
    // Add the stanza grid (always visible)
    poemBody.appendChild(stanzaGrid);

    pageContent.appendChild(header);
    pageContent.appendChild(poemBody);

    const footer = document.createElement('footer');
    
    const topRow = document.createElement('div');
    topRow.className = 'footer-top';
    
    const pageCount = document.createElement('span');
    pageCount.className = 'page-count';
    pageCount.textContent = `Page ${index + 1} of ${poems.length}`;
    topRow.appendChild(pageCount);
    
    footer.appendChild(topRow);

    const scrollHint = document.createElement('span');
    scrollHint.className = 'scroll-hint';
    scrollHint.textContent = 'Scroll inside the page to read the full poem';
    footer.appendChild(scrollHint);

    page.appendChild(pageContent);
    page.appendChild(footer);
    pagesContainer.appendChild(page);
    pages.push(page);
  });
  
  // Setup scroll shadows after rendering
  requestAnimationFrame(() => {
    setupScrollShadows();
  });
}

function updatePages() {
  if (!prevBtn || !nextBtn) return;
  
  pages.forEach((page, index) => {
    const flipped = index < currentPage;
    page.classList.toggle('flipped', flipped);
    page.classList.toggle('active', index === currentPage);
    page.style.zIndex = String(pages.length - index);
    page.style.transform = flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)';
  });

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === pages.length - 1;
}

function changePage(delta) {
  if (pages.length === 0) return;
  
  const nextPage = Math.min(pages.length - 1, Math.max(0, currentPage + delta));
  if (nextPage !== currentPage) {
    currentPage = nextPage;
    updatePages();
    const activeContent = pages[currentPage]?.querySelector('.page-content');
    if (activeContent) {
      activeContent.scrollTop = 0;
      updateScrollShadow(activeContent);
    }
    // On mobile, scroll to top of the new poem
    if (isMobileDevice()) {
      const activePage = pages[currentPage];
      if (activePage) {
        // Scroll to the new page
        requestAnimationFrame(() => {
          const rect = activePage.getBoundingClientRect();
          const scrollTop = getScrollTop();
          const targetPosition = rect.top + scrollTop - MOBILE_SCROLL_OFFSET;
          window.scrollTo({
            top: targetPosition,
            behavior: 'smooth'
          });
        });
      }
    }
  }
}

// Update scroll shadow visibility based on scroll position
function updateScrollShadow(element) {
  if (!element) return;
  
  const { scrollTop, scrollHeight, clientHeight } = element;
  const isAtTop = scrollTop < SCROLL_THRESHOLD;
  const isAtBottom = scrollHeight - scrollTop - clientHeight < SCROLL_THRESHOLD;
  
  // Remove all shadow classes first
  element.classList.remove('has-more-content-top', 'has-more-content-bottom');
  
  // Add appropriate classes based on scroll position
  if (!isAtTop && !isAtBottom) {
    element.classList.add('has-more-content-top', 'has-more-content-bottom');
  } else if (!isAtTop) {
    element.classList.add('has-more-content-top');
  } else if (!isAtBottom) {
    element.classList.add('has-more-content-bottom');
  }
}

// Setup scroll listeners for all page-content elements
function setupScrollShadows() {
  const pageContents = document.querySelectorAll('.page-content');
  pageContents.forEach((content) => {
    updateScrollShadow(content);
    // Add scroll listener if not already added
    if (!content.dataset.scrollListenerAdded) {
      const scrollHandler = () => updateScrollShadow(content);
      content.addEventListener('scroll', scrollHandler, { passive: true });
      content.dataset.scrollListenerAdded = 'true';
    }
  });
}


// Load poems from YAML files
async function loadPoems() {
  try {
    // Load the index.json to get the list of YAML files
    const indexResponse = await fetch('poems/index.json');
    if (!indexResponse.ok) {
      throw new Error(`Failed to load index.json: ${indexResponse.status} ${indexResponse.statusText}`);
    }
    const indexData = await indexResponse.json();
    
    if (!indexData.poems || !Array.isArray(indexData.poems)) {
      throw new Error('Invalid index.json format: missing or invalid poems array');
    }
    
    if (indexData.poems.length === 0) {
      throw new Error('No poems listed in index.json');
    }
    
    // Load and parse each YAML file
    const poemPromises = indexData.poems.map(async (filename) => {
      if (typeof filename !== 'string' || !filename.endsWith('.yaml')) {
        throw new Error(`Invalid filename in index.json: ${filename}`);
      }
      
      const yamlResponse = await fetch(`poems/${filename}`);
      if (!yamlResponse.ok) {
        throw new Error(`Failed to load ${filename}: ${yamlResponse.status} ${yamlResponse.statusText}`);
      }
      const yamlText = await yamlResponse.text();
      
      if (typeof jsyaml === 'undefined' || !jsyaml.load) {
        throw new Error('js-yaml library not loaded. Please check the script tag.');
      }
      
      const poem = jsyaml.load(yamlText);
      if (!poem || typeof poem !== 'object') {
        throw new Error(`Invalid poem format in ${filename}: not an object`);
      }
      
      if (!poem.title || typeof poem.title !== 'string') {
        throw new Error(`Invalid poem format in ${filename}: missing or invalid title`);
      }
      
      if (!poem.original || typeof poem.original !== 'string') {
        throw new Error(`Invalid poem format in ${filename}: missing or invalid original`);
      }
      
      if (!poem.translation || typeof poem.translation !== 'string') {
        throw new Error(`Invalid poem format in ${filename}: missing or invalid translation`);
      }
      
      return poem;
    });
    
    // Wait for all poems to load
    poems = await Promise.all(poemPromises);
    
    if (poems.length === 0) {
      throw new Error('No poems loaded successfully');
    }
    
    // Initialize the notebook once all poems are loaded
    renderPoems();
    updatePages();
    setupScrollShadows();
  } catch (error) {
    console.error('Error loading poems:', error);
    const errorMessage = error instanceof Error ? escapeHtml(error.message) : 'Unknown error';
    if (pagesContainer) {
      pagesContainer.innerHTML = `
        <div style="padding: 2rem; text-align: center; color: var(--ink);">
          <p style="font-size: 1.1rem; margin-bottom: 0.5rem;">Error loading poems</p>
          <p style="font-size: 0.9rem; color: #7a6456;">${errorMessage}</p>
          <p style="font-size: 0.85rem; margin-top: 1rem; color: #7a6456;">Please check the console for details.</p>
        </div>
      `;
    }
  }
}

// Hide scroll indicator
function hideScrollIndicator() {
  const indicator = document.querySelector('.scroll-indicator');
  if (indicator) {
    indicator.classList.add('hidden');
  }
  scrollIndicatorHidden = true;
}

// Show scroll indicator
function showScrollIndicator() {
  const indicator = document.querySelector('.scroll-indicator');
  if (indicator) {
    indicator.classList.remove('hidden');
  }
  scrollIndicatorHidden = false;
}

// Open the notebook when it scrolls into view or is clicked
function setupNotebookReveal() {
  const target = document.querySelector('.notebook-stage');
  if (!target || !notebook) return;

  function openNotebook() {
    if (notebook.classList.contains('open')) return;
    
    notebook.classList.add('open');
    hideScrollIndicator();
    // Observer is set up after pages render, no need to set it up here
    setTimeout(() => {
      notebook.classList.add('label-hidden');
    }, LABEL_HIDE_DELAY);
  }

  // Allow opening by clicking the cover
  const coverFront = document.querySelector('.cover.front');
  if (coverFront) {
    // Remove old listener if exists
    if (eventHandlers.coverClick) {
      coverFront.removeEventListener('click', eventHandlers.coverClick);
    }
    
    eventHandlers.coverClick = openNotebook;
    coverFront.addEventListener('click', eventHandlers.coverClick);
  }

  // Use IntersectionObserver if available
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            openNotebook();
            observer.disconnect();
          }
        });
      },
      { root: null, threshold: INTERSECTION_THRESHOLD }
    );
    observer.observe(target);
  } else {
    // Fallback: open when user scrolls to the notebook
    const onScroll = () => {
      const rect = target.getBoundingClientRect();
      const vh = window.innerHeight ?? document.documentElement.clientHeight;
      if (rect.top < vh * SCROLL_TRIGGER_RATIO) {
        openNotebook();
        if (eventHandlers.scroll) {
          window.removeEventListener('scroll', eventHandlers.scroll, { passive: true });
          eventHandlers.scroll = null;
        }
      }
    };
    
    eventHandlers.scroll = onScroll;
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll(); // Check if already in view on load
  }
}

// Initialize the application
function init() {
  // Validate DOM elements
  notebook = document.getElementById('notebook');
  pagesContainer = document.getElementById('pages');
  prevBtn = document.getElementById('prevPage');
  nextBtn = document.getElementById('nextPage');
  
  if (!notebook || !pagesContainer || !prevBtn || !nextBtn) {
    console.error('Required DOM elements not found');
    return;
  }

  // Keyboard navigation
  const keyboardHandler = (event) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      changePage(1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      changePage(-1);
    }
  };
  
  eventHandlers.keyboard = keyboardHandler;
  window.addEventListener('keydown', keyboardHandler);

  // Navigation buttons
  prevBtn.addEventListener('click', () => changePage(-1));
  nextBtn.addEventListener('click', () => changePage(1));

  // Touch swipe handling
  const stage = document.querySelector('.notebook-stage');
  if (stage) {
    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;

    stage.addEventListener(
      'touchstart',
      (event) => {
        if (event.touches.length !== 1) return;
        const touch = event.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        touchStartTime = Date.now();
      },
      { passive: true }
    );

    stage.addEventListener(
      'touchend',
      (event) => {
        if (!touchStartTime || event.changedTouches.length !== 1) return;
        const touch = event.changedTouches[0];
        const deltaX = touch.clientX - touchStartX;
        const deltaY = touch.clientY - touchStartY;
        const duration = Date.now() - touchStartTime;
        touchStartTime = 0;

        const isHorizontalSwipe =
          Math.abs(deltaX) > Math.abs(deltaY) &&
          Math.abs(deltaX) > SWIPE_THRESHOLD &&
          duration < SWIPE_MAX_DURATION;

        if (isHorizontalSwipe) {
          changePage(deltaX < 0 ? 1 : -1);
        }
      },
      { passive: true }
    );
  }

  // Scroll indicator click handler
  const scrollIndicator = document.querySelector('.scroll-indicator');
  if (scrollIndicator) {
    const scrollIndicatorHandler = () => {
      const notebookStage = document.querySelector('.notebook-stage');
      if (notebookStage) {
        const rect = notebookStage.getBoundingClientRect();
        const scrollTop = getScrollTop();
        const targetPosition = rect.top + scrollTop - SCROLL_INDICATOR_OFFSET;
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
        hideScrollIndicator();
      }
    };
    
    eventHandlers.scrollIndicator = scrollIndicatorHandler;
    scrollIndicator.addEventListener('click', scrollIndicatorHandler);
  }

  // Manage scroll indicator visibility based on scroll position
  // Remove any existing scroll hide handler first
  if (eventHandlers.scrollHide) {
    window.removeEventListener('scroll', eventHandlers.scrollHide, { passive: true });
  }
  
  const scrollIndicatorVisibilityHandler = () => {
    const scrollY = getScrollTop();
    const indicator = document.querySelector('.scroll-indicator');
    
    if (!indicator) return;
    
    // Show indicator when near top, hide when scrolled down
    if (scrollY <= SCROLL_INDICATOR_HIDE_THRESHOLD) {
      if (scrollIndicatorHidden) {
        showScrollIndicator();
      }
    } else {
      if (!scrollIndicatorHidden) {
        hideScrollIndicator();
      }
    }
  };
  
  eventHandlers.scrollHide = scrollIndicatorVisibilityHandler;
  window.addEventListener('scroll', scrollIndicatorVisibilityHandler, { passive: true });
  
  // Initial check on load
  scrollIndicatorVisibilityHandler();

  // Update scroll shadows on window resize (e.g., device rotation)
  const resizeHandler = () => {
    clearTimeout(resizeTimeout);
    invalidateMobileCache();
    resizeTimeout = setTimeout(() => {
      setupScrollShadows();
    }, RESIZE_DEBOUNCE_DELAY);
  };
  
  eventHandlers.resize = resizeHandler;
  window.addEventListener('resize', resizeHandler, { passive: true });

  // Setup notebook reveal
  setupNotebookReveal();

  // Load poems
  loadPoems();
}

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  // DOM is already ready
  init();
}
