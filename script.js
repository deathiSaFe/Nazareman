// #region dark-light toggletheme
function toggleTheme() {
  document.body.classList.toggle("dark-theme");
}
// #endregion

// #region drawer
function openDrawer() {
  document.getElementById("myDrawer").style.width = "250px";
}

function closeDrawer() {
  document.getElementById("myDrawer").style.width = "0";
}
//#endregion

// #region togglesection
function toggleSection(sectionId) {
  const section = document.getElementById(sectionId);
  section.style.display = section.style.display === "block" ? "none" : "block";
}
// #endregion

// #region section 1-tab code-place-person-product
document.querySelectorAll("#section1 .tabs a").forEach((tab) => {
  tab.addEventListener("click", function (e) {
    e.preventDefault();
    document
      .querySelectorAll("#section1 .tabs a")
      .forEach((t) => t.classList.remove("active"));
    document
      .querySelectorAll("#section1 .tab-content")
      .forEach((content) => (content.style.display = "none"));
    this.classList.add("active");
    document.querySelector(this.getAttribute("href")).style.display = "block";
  });
});
// #endregion

// #region section 1-place-tab
//place search
$(document).ready(function () {
  $.getJSON("database/places.json", function (data) {
    var shops = [];
    data.categories.forEach(function (category) {
      category.shops.forEach(function (shop) {
        shops.push(shop);
      });
    });

    shops.forEach(function (shop) {
      $("#dropdown-content").append(
        "<div onclick=\"selectShop('" + shop + "')\">" + shop + "</div>"
      );
    });
  });

  $(document).click(function (event) {
    if (!$(event.target).closest(".dropdown").length) {
      hideDropdown();
    }
  });
});

function filterFunction() {
  var input, filter, div, i;
  input = document.getElementById("shop-search");
  filter = input.value.toUpperCase();
  div = document.getElementById("dropdown-content");
  div.classList.add("show");
  var items = div.getElementsByTagName("div");
  for (i = 0; i < items.length; i++) {
    var txtValue = items[i].textContent || items[i].innerText;
    if (txtValue.toUpperCase().indexOf(filter) > -1) {
      items[i].style.display = "";
    } else {
      items[i].style.display = "none";
    }
  }

  // Show or hide the clear button based on input value
  var clearButton = document.querySelector(".clear-button");
  if (input.value) {
    clearButton.style.display = "block";
  } else {
    clearButton.style.display = "none";
  }
}

function selectShop(shop) {
  $("#shop-search").val(shop);
  hideDropdown();
  document.querySelector(".clear-button").style.display = "block"; // Show the clear button when an item is selected
}

function hideDropdown() {
  document.getElementById("dropdown-content").classList.remove("show");
}

function showAllItems() {
  var div = document.getElementById("dropdown-content");
  var items = div.getElementsByTagName("div");
  for (var i = 0; i < items.length; i++) {
    items[i].style.display = "";
  }
  div.classList.add("show");
}

function clearSearch() {
  $("#shop-search").val("");
  hideDropdown();
  document.querySelector(".clear-button").style.display = "none"; // Hide the clear button
  document.getElementById("shop-search").focus(); // Focus back on the search input
}
// to make sure that the enter button picks the typed item
document
  .getElementById("shop-search")
  .addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      event.preventDefault(); // Prevent form submission
      var input = document.getElementById("shop-search").value;
      var items = document
        .getElementById("dropdown-content")
        .getElementsByTagName("div");
      var found = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i].innerText === input) {
          found = true;
          break;
        }
      }
      if (!found && input) {
        document.getElementById("message-box").style.display = "block";
      }
    }
  });

// this is to insure that whenever the search bar is clicked, the screen moves up
// the mobile keyboard wont cover the dropdown
document.getElementById("shop-search").addEventListener("focus", function () {
  setTimeout(function () {
    document
      .getElementById("shop-search")
      .scrollIntoView({ behavior: "smooth", block: "center" });
  }, 500); // Delay to ensure the keyboard is fully visible
});

// the warning message in case the selected item is not on the list
document.getElementById("shop-search").addEventListener("blur", function () {
  var input = document.getElementById("shop-search").value;
  var items = document
    .getElementById("dropdown-content")
    .getElementsByTagName("div");
  var found = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].innerText === input) {
      found = true;
      break;
    }
  }
  if (!found && input) {
    document.getElementById("message-box").style.display = "block";
  }
});

document.getElementById("yes-button").addEventListener("click", function () {
  var input = document.getElementById("shop-search").value;
  // Save the picked item to a variable
  var pickedItem = input;
  document.getElementById("message-box").style.display = "none";
  document.getElementById("confirmation-box").style.display = "block";
  document.getElementById("shop-search").value = "";
  document.getElementById("shop-search").focus();
});

document.getElementById("no-button").addEventListener("click", function () {
  document.getElementById("message-box").style.display = "none";
  document.getElementById("shop-search").value = "";
  document.getElementById("shop-search").focus();
});

document.getElementById("close-button").addEventListener("click", function () {
  document.getElementById("confirmation-box").style.display = "none";
  document.getElementById("shop-search").value = "";
  document.getElementById("shop-search").focus();
});

// search by my location,by map and by city buttons
document.addEventListener("DOMContentLoaded", function () {
  // Set the default selected radio button
  document.getElementById("location-search").checked = true;
  activateRow(1); // Activate the first row by default

  // Add event listeners to radio buttons
  const radios = document.querySelectorAll('input[name="search-type"]');
  radios.forEach((radio, index) => {
    radio.addEventListener("change", () => {
      activateRow(index + 1);
    });
  });

  // Add event listeners to range sliders
  const rangeSliders = document.querySelectorAll('input[type="range"]');
  rangeSliders.forEach((slider) => {
    slider.addEventListener("input", (event) => {
      const value = event.target.value;
      const rangeValueElement = event.target.nextElementSibling;
      rangeValueElement.textContent = `${value} کیلومتر`;
    });
  });
});

function activateRow(rowNumber) {
  const rows = document.querySelectorAll("#section1 .search-row");
  rows.forEach((row, index) => {
    if (index + 1 === rowNumber) {
      row.classList.add("active");
      row
        .querySelectorAll('button, input[type="range"], select')
        .forEach((el) => (el.disabled = false));
    } else {
      row.classList.remove("active");
      row
        .querySelectorAll('button, input[type="range"], select')
        .forEach((el) => (el.disabled = true));
    }
  });
}

// gelocation for the section 1 place tab
document.querySelector(".location-btn").addEventListener("click", function () {
  if (navigator.userAgent.indexOf("Mobi") === -1) {
    document.getElementById("warningModal").style.display = "flex";
  } else {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (position) {
        document.querySelector(".location-btn").style.display = "none";
        document.getElementById("successMessage").style.display = "flex";
      });
    } else {
      alert("Geolocation is not supported by this browser.");
    }
  }
});

document.getElementById("closeModal").addEventListener("click", function () {
  document.getElementById("warningModal").style.display = "none";
});

document.getElementById("closeSuccess").addEventListener("click", function () {
  document.getElementById("successMessage").style.display = "none";
  document.querySelector(".container").style.display = "flex";
  document.querySelector(".container").style.justifyContent = "center";
  document.querySelector(".container").style.alignItems = "center";
});
// #endregion
