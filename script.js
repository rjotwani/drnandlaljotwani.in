const notebook = document.getElementById("notebook");
const pagesContainer = document.getElementById("pages");
const prevBtn = document.getElementById("prevPage");
const nextBtn = document.getElementById("nextPage");
let pages = [];
let currentPage = 0;

// Convert newlines to <br /> tags
function formatText(text) {
  if (typeof text !== 'string') return '';
  const lines = text
    .replace(/\r\n/g, '\n') // Normalize line endings
    .replace(/\r/g, '\n')
    .split('\n');
  
  const result = [];
  let prevWasEmpty = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isEmpty = line.trim() === '';
    
    if (isEmpty) {
      // Only add one break for consecutive empty lines (paragraph break)
      if (!prevWasEmpty) {
        result.push('<br />');
      }
      prevWasEmpty = true;
    } else {
      // Add break before this line if there was a previous line
      if (result.length > 0) {
        result.push('<br />');
      }
      result.push(line);
      prevWasEmpty = false;
    }
  }
  
  return result.join('');
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

    const original = document.createElement("p");
    original.className = "original";
    original.innerHTML = formatText(poem.original);
    poemBody.appendChild(original);

    const translation = document.createElement("p");
    translation.className = "translation";
    translation.innerHTML = formatText(poem.translation);
    poemBody.appendChild(translation);

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

    page.appendChild(pageContent);
    page.appendChild(footer);
    pagesContainer.appendChild(page);
    pages.push(page);
  });
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
    }
  }
}

const stage = document.querySelector(".notebook-stage");

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowRight") changePage(1);
  if (event.key === "ArrowLeft") changePage(-1);
});

prevBtn.addEventListener("click", () => changePage(-1));
nextBtn.addEventListener("click", () => changePage(1));

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;

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

    const horizontalSwipe =
      Math.abs(deltaX) > Math.abs(deltaY) &&
      Math.abs(deltaX) > 45 &&
      duration < 600;

    if (!horizontalSwipe) return;
    if (deltaX < 0) changePage(1);
    else changePage(-1);
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
    });
  });
}

// Initialize
renderPoems();
setupTranslationToggles();
updatePages();

// Open the notebook only when it scrolls into view
function setupNotebookReveal() {
  const target = document.querySelector(".notebook-stage");
  if (!target) return;

  function openNotebook() {
    if (!notebook.classList.contains("open")) {
      notebook.classList.add("open");
      // Hide the cover label after the flip animation has finished
      setTimeout(() => {
        notebook.classList.add("label-hidden");
      }, 300);
    }
  }

  // Also allow opening by tapping/clicking the cover/front area
  const coverFront = document.querySelector(".cover.front");
  if (coverFront) {
    coverFront.addEventListener("click", () => {
      openNotebook();
    });
  }

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
      {
        root: null,
        // Open when a good portion of the notebook is in view
        threshold: 0.7,
      }
    );
    observer.observe(target);
  } else {
    // Fallback: open when user scrolls a bit further down to the notebook
    const onScroll = () => {
      const rect = target.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      // Trigger when the top of the notebook is comfortably inside the viewport
      if (rect.top < vh * 0.5) {
        openNotebook();
        window.removeEventListener("scroll", onScroll);
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // In case it's already in view on load
    onScroll();
  }
}

setupNotebookReveal();

