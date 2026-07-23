import * as itowns from 'itowns';

var scaler, meshes = [];
// Get our `<div id="viewerId">` element. When creating a `View`, a canvas will
// be appended to this element.
const viewerDiv = document.getElementById('viewerDiv');

// Define an initial camera position
const placement = {
    coord: new itowns.Coordinates('EPSG:4326', 4.835119, 45.757838),
    range: 25000,
};
// Create an empty Globe View
const view = new itowns.GlobeView(viewerDiv, placement);

// Declare your data source configuration. In this context, those are the
// parameters used in the WMTS requests.
const orthoConfig = {
    'url': 'https://data.geopf.fr/wmts',
    'crs': 'EPSG:3857',
    'format': 'image/jpeg',
    'name': 'ORTHOIMAGERY.ORTHOPHOTOS',
    'tileMatrixSet': 'PM',
};

// Instantiate the WMTS source of your imagery layer.
const imagerySource = new itowns.WMTSSource(orthoConfig);

// Create your imagery layer
const imageryLayer = new itowns.ColorLayer('imagery', {
    source: imagerySource,
});

// Add it to source view!
view.addLayer(imageryLayer);


// Add two elevation layers.
// These will deform iTowns globe geometry to represent terrain elevation.
function addElevationLayerFromConfig(config) {
    config.source = new itowns.WMTSSource(config.source);
    var layer = new itowns.ElevationLayer(config.id, config);
    view.addLayer(layer);
}
itowns.Fetcher.json('./layers/JSONLayers/IGN_MNT_HIGHRES.json').then(addElevationLayerFromConfig);
itowns.Fetcher.json('./layers/JSONLayers/WORLD_DTM.json').then(addElevationLayerFromConfig);

function colorBuildings(properties) {
    if (properties.usage_1 === 'Résidentiel') {
        return '#FDFDFF';
    } else if (properties.usage_1 === 'Annexe') {
        return '#C6C5B9';
    } else if (properties.usage_1 === 'Commercial et services') {
        return '#62929E';
    } else if (properties.usage_1 === 'Religieux') {
        return '#393D3F';
    } else if (properties.usage_1 === 'Sportif') {
        return '#546A7B';
    }

    return '#555555';
}

function altitudeBuildings(properties) {
    return properties.altitude_minimale_sol;
}

function extrudeBuildings(properties) {
    return properties.hauteur;
}

var useFixedHeight = true;
var useFixedColor = true;

function acceptFeature(properties) {
    return !!properties.hauteur;
}

scaler = function update(/* dt */) {
    var i;
    var mesh;
    if (meshes.length) {
        view.notifyChange(view.camera3D, true);
    }
    for (i = 0; i < meshes.length; i++) {
        mesh = meshes[i];
        if (mesh) {
            mesh.scale.z = Math.min(
                1.0, mesh.scale.z + 0.1);
            mesh.updateMatrixWorld(true);
        }
    }
    meshes = meshes.filter(function filter(m) { return m.scale.z < 1; });
};

view.addFrameRequester(itowns.MAIN_LOOP_EVENTS.BEFORE_RENDER, scaler);

var wfsBuildingSource = new itowns.WFSSource({
    url: 'https://data.geopf.fr/wfs/ows?',
    version: '2.0.0',
    typeName: 'BDTOPO_V3:batiment',
    crs: 'EPSG:4326',
    ipr: 'IGN',
    format: 'application/json',
    extent: {
        west: 4.568,
        east: 5.18,
        south: 45.437,
        north: 46.03,
    },
});

var wfsBuildingLayer = new itowns.FeatureGeometryLayer('WFS Building',{
    batchId: function (property, featureId) { return featureId; },
    onMeshCreated: function scaleZ(mesh) {
        mesh.children.forEach(c => {
            c.scale.z = 0.01;
            meshes.push(c);
        })
    },
    filter: acceptFeature,
    source: wfsBuildingSource,
    zoom: { min: 14 },
    style: { fill: {
        color: colorBuildings,
        base_altitude: altitudeBuildings,
        extrusion_height: extrudeBuildings } }
});

view.addLayer(wfsBuildingLayer);
