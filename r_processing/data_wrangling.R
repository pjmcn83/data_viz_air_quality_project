library(sf)
library(tidyverse)
library(leaflet)
library(jsonlite)


#############
# CITY DATA #
#############

# OBJECTIVE: The following script generates our dataset of world cities vulnerability to air quality.

# We open load our dataset,
# We will use the GHS Urban Centre Database. It is a global dataset of over 10,000 urban centers developed by the European Commission, providing multi-temporal and multi-thematic information based on a globally harmonized methodology. It supports global monitoring of policy frameworks and provides data for urban studies. It can be retrieved from https://human-settlement.emergency.copernicus.eu/ghs_ucdb_2024.php

cities <- st_read("data/GHS_UCDB_GLOBE_R2024A.gpkg")

# We are going to use just a couple of variables.
cities <- cities %>% 
  select(1:7)

# We keep those cities that have at least 1 million inhabitants.
cities <- cities %>% 
  filter(X.GC_POP_TOT_2025 >= 1000000) 

# It's a geopackage, so we can explore its multiple layers.
st_layers("data/GHS_UCDB_GLOBE_R2024A.gpkg")

# We will be working just with a couple of them. Our main goal it's to exploit the range of the dataset as well as it normalized key indicators so as to build a general index to measure air quality vulnerability around the world. 
# Let's open the emission layer.
emisions <- st_read("data/GHS_UCDB_GLOBE_R2024A.gpkg",
                    layer = "GHS_UCDB_THEME_EMISSIONS_GLOBE_R2024A")

# We are going to use just a couple of key variables.
emisions <- emisions %>% 
  select(1,
         contains("2020")) %>% # The latests value.
  st_set_geometry(NULL)

# Let's open the socio-economic layer.
socio <- st_read("data/GHS_UCDB_GLOBE_R2024A.gpkg",
                    layer = "GHS_UCDB_THEME_SOCIOECONOMIC_GLOBE_R2024A")

# We are going to use just a couple of key variables.
socio <- socio %>% 
  select(1,
         contains("2020")) %>% # The latest value
  st_set_geometry(NULL)

# Let's open the land use layer.
land_use <- st_read("data/GHS_UCDB_GLOBE_R2024A.gpkg",
                 layer = "GHS_UCDB_THEME_SDG_GLOBE_R2024A")

# We are going to use just a couple of key variables.
land_use <- land_use %>% 
  select(1,
         contains("2020")) %>% # The latest value.
  st_set_geometry(NULL)

# Let's open the greenness layer.
greenness <- st_read("data/GHS_UCDB_GLOBE_R2024A.gpkg",
                 layer = "GHS_UCDB_THEME_GREENNESS_GLOBE_R2024A")

# We are going to use just a couple of key variables.
greenness <- greenness %>% 
  select(1,
         contains("2020")) %>% #The latest value
  st_set_geometry(NULL)

# We open the sensor's dataset
sensors <- read_sf("data/sensors/city_sensor_count_clean.shp")

# We keep just the City's ID and the number of sensors
sensors <- sensors %>% 
  select(ID_UC_G0,
         sensor_cou) %>% 
  st_set_geometry(NULL)

# We join our datasets
cities <- cities %>% 
  left_join(emisions) %>% 
  left_join(socio) %>% 
  left_join(land_use) %>% 
  left_join(greenness) %>% 
  left_join(sensors,
            by = c("X.ID_UC_G0" = "ID_UC_G0"))

# Remove wrong character in the column name.
colnames(cities) <- str_remove(colnames(cities), "X.")

# We will keep just a couple of variables for our index.
cities_index <- cities %>% 
  select("country" = GC_CNT_GAD_2025,
         "city" = GC_UCN_MAI_2025,
         "population" = GC_POP_TOT_2025,
         "area" = GC_UCA_KM2_2025,
         "income_group" = GC_DEV_WIG_2025,
         "region" = GC_DEV_USR_2025,
         "land_consumption_rate" = SD_LUE_LCR_2010_2020,
         "hdi" = SC_SEC_HDI_2020,
         "death_pm2" = EM_PM2_MOR_2020,
         "greenness" = GR_AVG_GRN_2020,
         "sensors" = sensor_cou) %>% 
  mutate(density = population/area,
         sensor_density = sensors/area,
         death_pm2_by_pop = death_pm2/population)

# we create a variable to normalise values.
normalizar_minmax <- function(x, inverse = FALSE) {
  
  x_norm <- (x - min(x, na.rm = TRUE)) / (max(x, na.rm = TRUE) - min(x, na.rm = TRUE))
  
  if (inverse) x_norm <- 1 - x_norm
  
  return(x_norm)
}

# We look for correlations.
# library(corrplot)
# 
# cor_matrix <- cities_index %>%
#   select(hdi,
#        greenness,
#        sensors_norm, 
#        density_norm,
#        land_consumption_rate_norm,
#        death_pm2_norm) %>% 
#   drop_na() %>% 
#   st_drop_geometry() %>% 
#   cor(use = "complete.obs")
# 
# corrplot(cor_matrix, 
#          method = "color", 
#          type = "upper",
#          addCoef.col = "black",
#          tl.col = "black",
#          title = "Correlation matrix - normalized variables",
#          mar = c(0,0,1,0))

# Correlations are less than 0.5, which is a good signal. In this sense, we can discharge redundancy.

# We look for skews distributions of our variables.
# cities_index %>% 
# ggplot(aes(y = density)) +
#   geom_boxplot(fill = "steelblue") +
#   theme_minimal() +
#   coord_flip()
# 
# cities_index %>% 
#   ggplot(aes(y = sensor_density)) +
#   geom_histogram(fill = "steelblue") +
#   theme_minimal() +
#   coord_flip()

# library(moments)
# cities_index %>%
#   st_drop_geometry() %>% 
#   select(hdi, greenness, sensor_density, density, 
#          land_consumption_rate, death_pm2_by_pop) %>%
#   pivot_longer(everything(), names_to = "variable", values_to = "value") %>%
#   group_by(variable) %>%
#   summarise(
#     mean    = mean(value, na.rm = TRUE),
#     median  = median(value, na.rm = TRUE),
#     sd      = sd(value, na.rm = TRUE),
#     skewness = skewness(value, na.rm = TRUE),
#     kurtosis = kurtosis(value, na.rm = TRUE),
#     n_outliers_iqr = sum(value < quantile(value, 0.25, na.rm=TRUE) - 
#                            1.5 * IQR(value, na.rm=TRUE) |
#                            value > quantile(value, 0.75, na.rm=TRUE) + 
#                            1.5 * IQR(value, na.rm=TRUE), na.rm=TRUE)
#   )

# Population Density, Sensor Density and Land Consumption Ratio are highly skewed, so we are going to apply a logarithm scale before normalization.
cities_index <- cities_index %>% 
  mutate(
    # Inverse: high value = lower vulnerability
    hdi_norm              = normalizar_minmax(hdi,                    inverse = TRUE),
    greenness_norm          = normalizar_minmax(greenness,                inverse = TRUE),
    sensors_norm          = normalizar_minmax(log1p(sensor_density),  inverse = TRUE),
    
    # Direct: high value = higher vulnerability
    density_norm          = normalizar_minmax(log1p(density),         inverse = FALSE),
    land_consumption_norm = normalizar_minmax(log1p(land_consumption_rate), inverse = FALSE),
    death_pm2_norm        = normalizar_minmax(death_pm2_by_pop,       inverse = FALSE)
  )

# We are going to create an index to punctuate our cities according to vulnerabilities
cities_index <- cities_index %>% 
  mutate(index = (hdi_norm +
           greenness_norm +
           sensors_norm +
           density_norm +
           land_consumption_norm +
           death_pm2_norm ) / 6)

# We transform the CRS
cities_index <- cities_index %>% 
  st_transform(4326) %>% 
  drop_na()

# We create a color pallete.
pal <- colorNumeric(
  palette = "YlOrRd",   
  domain   = cities_index$index,
  reverse  = FALSE)

# Let's Map
leaflet(cities_index) %>% 
  addProviderTiles("Stadia.AlidadeSmooth") %>%          
  addPolygons(
    color       = "white",
    weight      = 0.5,
    fillColor   = ~pal(index),
    fillOpacity = 0.85,
    popup = ~paste0(
      "<b>", city, "</b><br>",
      "País: ", country, "<br>",
      "Índice: ", round(index, 3), "<br>",
      "Población: ", format(population, big.mark = ",")
    )) %>% 
  addLegend(
    position = "bottomright",
    pal      = pal,
    values   = ~index,
    title    = "Índice de<br>calidad del aire",
    opacity  = 0.9)

# Now, create a map of points.
cities_index_points <- cities_index %>% 
  st_make_valid() %>% 
  st_centroid()

# Now, we repeat the process
leaflet(cities_index_points) |>
  addProviderTiles("Stadia.AlidadeSmooth") %>%          
  addCircleMarkers(
    radius      = ~scales::rescale(log(population), to = c(3, 15)),
    fillColor   = ~pal(index),
    fillOpacity = 0.8,
    color       = "white",
    weight      = 0.5,
    popup = ~paste0("<b>", city, "</b><br>Índice: ", 
                    round(index, 3))
  ) %>% 
  addLegend("bottomright", pal = pal, values = ~index,
            title = "Índice calidad<br>del aire")

# Let's see some regional statistics.
regions <- cities_index %>% 
  st_set_geometry(NULL) %>% 
  group_by(region) %>% 
  summarise(n_cities = n(),
            averarge = mean(index),
            max = max(index),
            max_ciudad = city[which.max(index)],
            max_country = country[which.max(index)],
            min = min(index),
            min_ciudad = city[which.min(index)],
            min_country = country[which.min(index)])


# Let's calculate the distribution of index.
cities_index %>% pull(as.numeric(index)) %>% 
  classInt::classIntervals(., n = 6, style = "jenks")

# Let's export the Index.
cities_index %>%
  mutate(across(.cols = c("city", "country"),
                ~ . %>% str_trim()),
         city = if_else(city == "Hyderabad" & country == "Pakistan",
                        "Hyderabad (Pak)",
                        city),
         city = if_else(str_detect(city, "Colombo"),
                        "Colombo",
                        city)) %>% 
  select(city, 
         country,
         region,
         income_group,
         population,
         area,
         density_norm,
         hdi_norm,
         sensors_norm,
         death_pm2_norm,
         greenness_norm,
         land_consumption_norm,
         index) %>% 
  st_drop_geometry() %>% 
  toJSON(pretty = TRUE) %>% 
  write("data/cities.json")

# cities_index %>%
#   mutate(across(.cols = c("city", "country"),
#                 ~ . %>% str_trim()),
#          city = if_else(city == "Hyderabad" & country == "Pakistan",
#                         "Hyderabad (Pak)",
#                         city),
#          city = if_else(str_detect(city, "Colombo"),
#                         "Colombo",
#                         city)) %>% 
#   select(city, 
#          country,
#          region,
#          income_group,
#          population,
#          area,
#          density_norm,
#          hdi_norm,
#          sensors_norm,
#          death_pm2_norm,
#          greenness_norm,
#          land_consumption_norm,
#          index) %>% 
#   write_sf("data/cities_shape.geojson")


cities_index_points %>%
  mutate(across(.cols = c("city", "country"),
                ~ . %>% str_trim()),
         city = if_else(city == "Hyderabad" & country == "Pakistan",
                        "Hyderabad (Pak)",
                        city),
         city = if_else(str_detect(city, "Colombo"),
                        "Colombo",
                        city)) %>% 
  select(city, 
         country,
         region,
         income_group,
         population,
         area,
         density_norm,
         hdi_norm,
         sensors_norm,
         death_pm2_norm,
         greenness_norm,
         land_consumption_norm,
         index) %>% 
  write_sf("data/cities_points.geojson")

# Desarrollar una página web que me permita comparar los gráficos de radar de los distintos elementos de mi índice de dos ciudades distintas utilizando la librería d3 de javascript. La misma debería tener un panel selector donde se pueda elegir que ver en el gráfico 1 y el gráfico dos. Para facilitar la búsqueda, cada selector debería tener dos filtros: Region y país. Cómo podría realizar la misma? Puedes explicarme el paso a paso?

#data deserts y epistemic injustice 
