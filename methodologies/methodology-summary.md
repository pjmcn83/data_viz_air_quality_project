# METHODOLOGIES

## Website architecture

This website is built as a single-page scrolling application using fullPage.js (v4.0.20), which divides the site into discrete full-page sections that users navigate between vertically. Each thematic section is self-contained as pages which are independent HTML files embedded as iframes within the parent index.html. This allows each page’s contexts (maps, charts) to load and run in isolation rather than everything loading at once. Interactive maps are built with Mapbox GL JS (v3.9.0), using a combination of custom vector tilesets hosted on Mapbox and local GeoJSON files for spatial filtering and overlays. The city ranking visualisation is rendered with D3.js (v7.8.5). Cross-frame communication \- for example, forwarding scroll events from the boxplots iframe to trigger fullPage.js navigation \- is handled via the browser's postMessage API. Styling is managed through a shared global.css file that defines a dark colour palette via CSS custom properties, with the Manrope typeface loaded from Google Fonts.

## Data

### PM 2.5 Trends

This visualisation uses the [NASA EarthData Global Annual PM2.5 dataset](https://www.earthdata.nasa.gov/data/catalog/sedac-ciesin-sedac-sdei-gwrpm25-mmsvaod-5gl04-5.04) covering 25 years of satellite derived air quality observations. Global PM2.5 concentrations were downloaded as high-resolution rasters which at native resolution are too large for effective visualisation. The rasters were processed in Python using Rasterio, with a downsampling factor applied to reduce computational load. The sampled pixel values were aggregated into a H3 hex-grid, producing a single vector dataset more suitable for quick rendering.

The hex centroids were spatially joined against a country boundary dataset using GeoPandas with centroid based assignment ensuring each hex maps to a single country. Continent classifications were derived from the pycountry-convert library, and annual mean PM2.5 values computed at both levels. This was exported as JSON for efficient chart integration.

The visualisation itself was built using Mapbox GL JS and Chart.js. Hexagonal fills are mapped against [WHO air quality thresholds](https://www.who.int/publications/i/item/9789240034228) and updated dynamically using year selection without requiring a data reload. A temporal slider allows manual selection across years 1998–2022, as well as automated animation through a Play button. Selecting a hexagon animates the map to the corresponding country boundary, and reveals a temporal chart displaying four data series: the local hex values, a trendline, the country annual mean, and the continental mean.

The full pm2.5 workflow is available as a Jupyter Notebook from [GitHub](https://raw.githubusercontent.com/SSoubie/data_viz_air_quality_project/refs/heads/main/methodologies/pm25_global/Global_PM2-5_Analysis.ipynb).

### AQICN Data

To create a global-level AQICN dataset of sensor locations, we used the Geolocalized Feed (lat/long based) API to scrape the database. The script for this data scrape is available at: [AQICN\_global\_scrape.py](https://github.com/SSoubie/data_viz_air_quality_project/tree/main/methodologies/AQICN_data_scrape)

### Country-level data

Using QGIS, sensor points (AQICN), a gridded population raster (GHS Population) and global country boundaries (GeoBoundaries), we calculated the percentage of each country’s population located within 5km of an air sensor. The main tools used to achieve this were:

- Buffer (to create polygons of 5km radius around each sensor point)  
- r.resamp.stats (to calculate the total population within each country, and the total population located within 5km sensor coverage)  
- Count points in polygon (count sensors per country)  
- Raster calculator (to transform population densities so that the final raster layer could be exported as a Byte Data Type)

Limitations:

- Sensors not located within the boundary of a country’s GIS layer are not included in the count/visualization of that country.

### City-level data

Using QGIS, we counted the number of air sensor points (AQICN) located within the boundaries of cities with populations greater than 1 million (GSH Urban Centres Data Base).

### Creating a Vulnerability Index

Air pollution can be defined as an environmental stressor and a determinant of human health, which directly influences a system's susceptibility to harm (IPCC, 2022). Around the world, populations in low- and middle-income countries bear a disproportionate share of this burden, as approximately 80% of the 7.3 billion people exposed to unsafe PM2.5 concentrations live in the Global South (Rentschler & Leonova, 2023).

Based in this context, this index is designed to estimate indirectly the air quality vulnerability of a city using socioeconomic and environmental proxy indicators, considering the lack of coverage of air quality monitoring sensors around the world, but particularly in the Global South (Schoch et al, 2025; Smith et al, 2025). Its aim is to generate a general indicator that identifies those cities that are most exposed, sensitive, and least equipped to cope with air pollution, and therefore most urgently in need of systematic measurement.

This index works with data from the Global Human Settlement Layer (GHSL) Urban Centre Database (UCDB R2024A) from Copernicus (European Union). The unit of analysis is cities with over 1 million inhabitants.

Six indicators were selected from that database based on their theoretical relevance to air quality vulnerability and global coverage to build an index of air quality vulnerability. They are:

* Population Density (2025), calculated as the ratio of population to area (km²), as there is a correlation between high density urban areas and pollutant concentrations (Rowley & Karakus, 2023).

* Human Development Index (2020), given the negative  impact of air pollution on Life Expectancy (Sandica et al, 2018). 

* Premature deaths due to PM2.5 concentrations per 100,000 inhabitants (2020), used as a direct indicator of health sensitivity to air pollution

* Mean greenness (NDVI) in the built-up area (within a 300m buffer of the built-up cells) (2020), addressing the role of vegetation in absorbing air pollutants (Diener & Mudu, 2021\)

* Land Consumption Rate (2020), used as a proxy for land use change and its positive relation with pollutant concentration (Zou et al, 2018\)

* Air Quality Monitor Density, calculated as the number of active monitoring stations per km² (2025). This is the only indicator from an external source (The World Air Quality Index Project, WAQI) and is used to capture the presence or absence of air quality monitoring infrastructure within each city's urban footprint, serving as a proxy for institutional capacity and data equity.

Prior to index construction, all variables were assessed for distributional skewness. Population density, land consumption rate and sensor density were log-transformed before normalization. All indicators were subsequently normalized to a \[0,1\] scale using min-max rescaling, with direction adjusted so that higher values consistently reflect greater vulnerability. The index was computed as an equally weighted average of the six normalized indicators.

For visualization display, some indicators’ names and their effects  were transformed to enhance interpretation of the index. However, their values within the score remained the same.

## Bibliography

Ara Begum, R., R. Lempert, E. Ali, T.A. Benjaminsen, T. Bernauer, W. Cramer, X. Cui, K. Mach, G. Nagy, N.C. Stenseth, R. Sukumar, and P. Wester, 2022: Point of Departure and Key Concepts. In: Climate Change 2022: Impacts, Adaptation and Vulnerability. Contribution of Working Group II to the Sixth Assessment Report of the Intergovernmental Panel on Climate Change \[H.-O. Pörtner, D.C. Roberts, M. Tignor, E.S. Poloczanska, K. Mintenbeck, A. Alegría, M. Craig, S. Langsdorf, S. Löschke, V. Möller, A. Okem, B. Rama (eds.)\]. Cambridge University Press, Cambridge, UK and New York, NY, USA, pp. 121–196, doi:10.1017/9781009325844.003.

Diener, A., & Mudu, P. (2021). How can vegetation protect us from air pollution? A critical review on green spaces' mitigation abilities for air-borne particles from a public health perspective-with implications for urban planning. Science of the Total Environment, 796, 148605\.

Rentschler, J., & Leonova, N. (2023). Global air pollution exposure and poverty. Nature communications, 14(1), 4432\.

Rowley, A., & Karakuş, O. (2023). Predicting air quality via multimodal AI and satellite imagery. Remote Sensing of Environment, 293, 113609\.

Săndică, A. M., Dudian, M., & Ştefănescu, A. (2018). Air pollution and human development in Europe: A new index using principal component analysis. Sustainability, 10(2), 312\.

Schoch, M., De Lauriere, C. F., & Bernauer, T. (2025). Monitoring Urban Air Pollution in the Global South: Large Gaps Associated with Economic Conditions and Political Institutions. bioRxiv, 2025-03.

Zou, B., Xu, S., Sternberg, T., & Fang, X. (2016). Effect of land use and cover change on air quality in urban sprawl. Sustainability, 8(7), 677\.

