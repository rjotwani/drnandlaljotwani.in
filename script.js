// DOM elements
const notebook = document.getElementById("notebook");
const pagesContainer = document.getElementById("pages");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");

// State
let pages = [];
let currentPage = 0;
let poems = []; // Will be loaded from YAML files

// Split text into stanzas (paragraphs separated by blank lines)
function splitIntoStanzas(text) {
  if (typeof text !== 'string') return [];
  
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n\s*\n+/) // Split on one or more newlines with optional whitespace (blank lines)
    .map(stanza => stanza.trim())
    .filter(stanza => stanza.length > 0);
}

// Format a single stanza (convert single newlines to <br />)
function formatStanza(stanza) {
  if (typeof stanza !== 'string') return '';
  
  return stanza
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('<br />');
}

// Convert newlines to <br /> tags, preserving paragraph breaks (for non-grid layout)
function formatText(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .reduce((acc, line, index, array) => {
      const isEmpty = line.trim() === '';
      const prevLine = index > 0 ? array[index - 1] : null;
      const prevWasEmpty = prevLine ? prevLine.trim() === '' : false;
      
      if (isEmpty) {
        // Only add one break for consecutive empty lines (paragraph break)
        if (!prevWasEmpty) {
          acc.push('<br />');
        }
      } else {
        // Add break before this line if there was a previous line
        if (acc.length > 0) {
          acc.push('<br />');
        }
        acc.push(line);
      }
      
      return acc;
    }, [])
    .join('');
}

// Render poems into pages
function renderPoems() {
  pagesContainer.innerHTML = "";
  pages = [];

  poems.forEach((poem, index) => {
    const page = document.createElement("article");
    page.className = "page";
    if (index === 0) page.classList.add("active");
    page.setAttribute("data-page", index + 1);

    const pageContent = document.createElement("div");
    pageContent.className = "page-content";

    const header = document.createElement("header");
    const h2 = document.createElement("h2");
    h2.textContent = poem.title;
    header.appendChild(h2);
    
    // Add translated title if available
    if (poem.titleTranslation) {
      const h3 = document.createElement("h3");
      h3.className = "title-translation";
      h3.textContent = poem.titleTranslation;
      header.appendChild(h3);
    }

    const poemBody = document.createElement("div");
    poemBody.className = "poem-body";

    // Split both texts into stanzas
    const originalStanzas = splitIntoStanzas(poem.original);
    const translationStanzas = splitIntoStanzas(poem.translation);
    
    // Determine the maximum number of stanzas to ensure we have matching pairs
    const maxStanzas = Math.max(originalStanzas.length, translationStanzas.length);
    
    // Create a grid container for stanza pairs
    const stanzaGrid = document.createElement("div");
    stanzaGrid.className = "stanza-grid";
    
    // Create rows for each stanza pair
    for (let i = 0; i < maxStanzas; i++) {
      const stanzaRow = document.createElement("div");
      stanzaRow.className = "stanza-row";
      if (i === 0) {
        stanzaRow.classList.add("first-stanza");
      }
      
      // Original stanza cell
      const originalCell = document.createElement("div");
      originalCell.className = "stanza-cell original";
      if (i < originalStanzas.length) {
        originalCell.innerHTML = formatStanza(originalStanzas[i]);
      } else {
        // Add empty cell if original has fewer stanzas
        originalCell.innerHTML = "&nbsp;";
      }
      stanzaRow.appendChild(originalCell);
      
      // Translation stanza cell
      const translationCell = document.createElement("div");
      translationCell.className = "stanza-cell translation";
      if (i < translationStanzas.length) {
        translationCell.innerHTML = formatStanza(translationStanzas[i]);
      } else {
        // Add empty cell if translation has fewer stanzas
        translationCell.innerHTML = "&nbsp;";
      }
      stanzaRow.appendChild(translationCell);
      
      stanzaGrid.appendChild(stanzaRow);
    }
    
    // For non-translation-visible state, show only original
    const original = document.createElement("p");
    original.className = "original";
    original.innerHTML = formatText(poem.original);
    poemBody.appendChild(original);
    
    // Add the grid (hidden by default, shown when translation is visible)
    poemBody.appendChild(stanzaGrid);

    pageContent.appendChild(header);
    pageContent.appendChild(poemBody);

    const footer = document.createElement("footer");
    
    const topRow = document.createElement("div");
    topRow.className = "footer-top";
    
    const toggleBtn = document.createElement("button");
    toggleBtn.className = "toggle-translation";
    toggleBtn.type = "button";
    toggleBtn.textContent = "Show translation";
    topRow.appendChild(toggleBtn);

    const pageCount = document.createElement("span");
    pageCount.className = "page-count";
    pageCount.textContent = `Page ${index + 1} of ${poems.length}`;
    topRow.appendChild(pageCount);
    
    footer.appendChild(topRow);

    const scrollHint = document.createElement("span");
    scrollHint.className = "scroll-hint";
    scrollHint.textContent = "Scroll inside the page to read the full poem";
    footer.appendChild(scrollHint);

    // Add scroll shadow element for mobile
    const scrollShadow = document.createElement("div");
    scrollShadow.className = "scroll-shadow";
    pageContent.appendChild(scrollShadow);

    page.appendChild(pageContent);
    page.appendChild(footer);
    pagesContainer.appendChild(page);
    pages.push(page);
  });
  
  // Setup scroll shadows after rendering
  setTimeout(() => setupScrollShadows(), 0);
}

function updatePages() {
  pages.forEach((page, index) => {
    const flipped = index < currentPage;
    page.classList.toggle("flipped", flipped);
    page.classList.toggle("active", index === currentPage);
    page.style.zIndex = pages.length - index;
    page.style.transform = flipped ? "rotateY(-180deg)" : "rotateY(0deg)";
  });

  prevBtn.disabled = currentPage === 0;
  nextBtn.disabled = currentPage === pages.length - 1;
}

function changePage(delta) {
  const nextPage = Math.min(pages.length - 1, Math.max(0, currentPage + delta));
  if (nextPage !== currentPage) {
    currentPage = nextPage;
    updatePages();
    const activeContent = pages[currentPage].querySelector(".page-content");
    if (activeContent) {
      activeContent.scrollTop = 0;
      updateScrollShadow(activeContent);
    }
  }
}

// Update scroll shadow visibility based on scroll position
function updateScrollShadow(element) {
  if (!element) return;
  
  const { scrollTop, scrollHeight, clientHeight } = element;
  const isAtTop = scrollTop < 10; // 10px threshold
  const isAtBottom = scrollHeight - scrollTop - clientHeight < 10; // 10px threshold
  
  // Remove all shadow classes first
  element.classList.remove("has-more-content", "has-more-content-top", "has-more-content-bottom");
  
  // Add appropriate classes based on scroll position
  if (!isAtTop && !isAtBottom) {
    // Scrolled from both top and bottom - show both shadows
    element.classList.add("has-more-content-top", "has-more-content-bottom");
  } else if (!isAtTop) {
    // Scrolled from top but at bottom - show top shadow only
    element.classList.add("has-more-content-top");
  } else if (!isAtBottom) {
    // At top but not at bottom - show bottom shadow only
    element.classList.add("has-more-content-bottom");
  }
  // If both at top and bottom, no shadows needed
}

// Setup scroll listeners for all page-content elements
function setupScrollShadows() {
  document.querySelectorAll(".page-content").forEach((content) => {
    updateScrollShadow(content);
    // Add scroll listener if not already added
    if (!content.dataset.scrollListenerAdded) {
      content.addEventListener("scroll", () => updateScrollShadow(content), { passive: true });
      content.dataset.scrollListenerAdded = "true";
    }
  });
}

// Keyboard navigation
window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") changePage(1);
  if (event.key === "ArrowLeft") changePage(-1);
});

prevBtn.addEventListener("click", () => changePage(-1));
nextBtn.addEventListener("click", () => changePage(1));

// Touch swipe handling
const stage = document.querySelector(".notebook-stage");
let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
const SWIPE_THRESHOLD = 45;
const SWIPE_MAX_DURATION = 600;

stage.addEventListener(
  "touchstart",
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
  "touchend",
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

    if (!isHorizontalSwipe) return;
    changePage(deltaX < 0 ? 1 : -1);
  },
  { passive: true }
);

function setupTranslationToggles() {
  document.querySelectorAll(".toggle-translation").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.closest(".page");
      const translation = page.querySelector(".translation");
      const visible = translation.classList.toggle("visible");
      page.classList.toggle("translation-visible", visible);
      button.textContent = visible ? "Hide translation" : "Show translation";
      // Update scroll shadow after translation toggle (content height may change)
      const pageContent = page.querySelector(".page-content");
      if (pageContent) {
        setTimeout(() => updateScrollShadow(pageContent), 100);
      }
    });
  });
}

// Load poems from YAML files
async function loadPoems() {
  try {
    // Load the index.json to get the list of YAML files
    const indexResponse = await fetch('poems/index.json');
    const indexData = await indexResponse.json();
    
    // Load and parse each YAML file
    const poemPromises = indexData.poems.map(async (filename) => {
      const yamlResponse = await fetch(`poems/${filename}`);
      const yamlText = await yamlResponse.text();
      const poem = jsyaml.load(yamlText);
      return poem;
    });
    
    // Wait for all poems to load
    poems = await Promise.all(poemPromises);
    
    // Initialize the notebook once all poems are loaded
    renderPoems();
    setupTranslationToggles();
    updatePages();
    setupScrollShadows();
  } catch (error) {
    console.error('Error loading poems:', error);
    pagesContainer.innerHTML = '<p style="padding: 2rem; text-align: center;">Error loading poems. Please check the console for details.</p>';
  }
}

// Initialize - load poems first, then render
loadPoems();

// Open the notebook when it scrolls into view or is clicked
function setupNotebookReveal() {
  const target = document.querySelector(".notebook-stage");
  if (!target) return;

  const LABEL_HIDE_DELAY = 300;
  const INTERSECTION_THRESHOLD = 0.7;
  const SCROLL_TRIGGER_RATIO = 0.5;

  function openNotebook() {
    if (notebook.classList.contains("open")) return;
    
    notebook.classList.add("open");
    // Hide the cover label after the flip animation has finished
    setTimeout(() => {
      notebook.classList.add("label-hidden");
    }, LABEL_HIDE_DELAY);
  }

  // Allow opening by clicking the cover
  const coverFront = document.querySelector(".cover.front");
  if (coverFront) {
    coverFront.addEventListener("click", openNotebook);
  }

  // Use IntersectionObserver if available
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            openNotebook();
            obs.disconnect();
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
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (rect.top < vh * SCROLL_TRIGGER_RATIO) {
        openNotebook();
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll(); // Check if already in view on load
  }
}

setupNotebookReveal();

// Update scroll shadows on window resize (e.g., device rotation)
let resizeTimeout;
window.addEventListener("resize", () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    setupScrollShadows();
  }, 150);
}, { passive: true });

