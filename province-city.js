///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////jason file loading for the states and cities////////////////////////////////////////////////////
let data;

// Load the JSON data
fetch("database/Iran-Cities.json")
  .then((response) => response.json())
  .then((jsonData) => {
    data = jsonData;
    populateProvinces();
  })
  .catch((error) => console.error("Error loading JSON:", error));

// Populate the provinces dropdown
function populateProvinces() {
  const provinceSelect = document.getElementById("province");
  provinceSelect.innerHTML = ""; // Clear existing options

  data.forEach((state) => {
    const option = document.createElement("option");
    option.value = state.state;
    option.textContent = state.state;
    provinceSelect.appendChild(option);
  });

  // Set default province to "تهران"
  provinceSelect.value = "تهران";
  updateCities();
}

function updateCities() {
  const provinceSelect = document.getElementById("province");
  const citySelect = document.getElementById("city");
  const selectedProvince = provinceSelect.value;

  citySelect.innerHTML = ""; // Clear existing options

  // Add the default placeholder option for the city select
  const defaultCityOption = document.createElement("option");
  defaultCityOption.value = "";
  defaultCityOption.textContent = "شهر";
  defaultCityOption.disabled = true;
  defaultCityOption.selected = true;
  citySelect.appendChild(defaultCityOption);

  const selectedState = data.find((state) => state.state === selectedProvince);
  if (selectedState) {
    selectedState.cities.forEach((city) => {
      const option = document.createElement("option");
      option.value = city.name;
      option.textContent = city.name;
      citySelect.appendChild(option);
    });
  }
}

// Add the default placeholder option for the province select
window.onload = function () {
  const provinceSelect = document.getElementById("province");
  const defaultProvinceOption = document.createElement("option");
  defaultProvinceOption.value = "";
  defaultProvinceOption.textContent = "استان";
  defaultProvinceOption.disabled = true;
  defaultProvinceOption.selected = true;
  provinceSelect.insertBefore(defaultProvinceOption, provinceSelect.firstChild);
};
