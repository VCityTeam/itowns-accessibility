import * as itowns from 'itowns';
import GuiTools from 'itowns-gui-tools';
import * as itownsDebug from 'itowns-debug';
import * as THREE from 'three';

var scaler, tile, meshes = [];
// Get our `<div id="viewerId">` element. When creating a `View`, a canvas will
// be appended to this element.
const viewerDiv = document.getElementById('viewerDiv');

// Define an initial camera position
var placement = {
    coord: new itowns.Coordinates('EPSG:4326', 4.855978, 45.761056), 
    range: 3000,
    tilt: 45,
}
// Create an empty Globe View
const view = new itowns.GlobeView(viewerDiv, placement);

var ambLight = new THREE.AmbientLight(0xffffff, 0.2);
view.scene.add(ambLight);

// Debug UI: dat.gui layer panel + tile debug overlay
const menuGlobe = new GuiTools('menuDiv', view);

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
view.addLayer(imageryLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));


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

function acceptFeature(properties) {
    return !!properties.hauteur;
}

function acceptTree(properties) {
    return !!properties.hauteurtotale_m;
}

function colorTree(properties) {
    // Darker/deeper green for taller trees, capped at 25m.
    var height = Math.min(properties.hauteurtotale_m || 5, 25);
    var lightness = 55 - (height / 25) * 30;
    return `hsl(110, 55%, ${lightness}%)`;
}

function radiusTree(properties) {
    var crownDiameter = properties.diametrecouronne_m || 3;
    return Math.min(Math.max(crownDiameter, 2), 12);
}

function altitudeLine(properties, ctx) {
    var result;
    var z = 0;
    if (ctx.coordinates) {
        result = itowns.DEMUtils.getTerrainObjectAt(view.tileLayer, ctx.coordinates, 0, tile);
        if (!result) {
            result = itowns.DEMUtils.getTerrainObjectAt(view.tileLayer, ctx.coordinates, 0);
        }
        if (result) {
            tile = [result.tile];
            z = result.coord.z;
        }
        return z + 5;
    }
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

var lyonExtent = {
    west: 4.568,
    east: 5.18,
    south: 45.437,
    north: 46.03,
};

var wfsBuildingSource = new itowns.WFSSource({
    url: 'https://data.geopf.fr/wfs/ows?',
    version: '2.0.0',
    typeName: 'BDTOPO_V3:batiment',
    crs: 'EPSG:4326',
    ipr: 'IGN',
    format: 'application/json',
    extent: lyonExtent,
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

view.addLayer(wfsBuildingLayer).then( (layer) => itownsDebug.GeometryDebug.createGeometryDebugUI(menuGlobe.gui, view, layer));

function rayoncouronne_m_function(properties) {
    return properties.rayoncouronne_m || 5;
}

function hauteurfut_m_function(properties) {
    return properties.hauteurfut_m || 20;
}

function hauteurtotale_m_function(properties) {
    return properties.hauteurtotale_m || 10;
}


const treeTrunkGeometry = new THREE.CylinderGeometry(1, 1, 1, 32);
const treeTrunkMaterial = new THREE.MeshPhongMaterial({ color: 0x8b4513 });
const treeCanopyGeometry = new THREE.SphereGeometry(1, 16, 10);
const treeCanopyMaterial = new THREE.MeshPhongMaterial({ color: 0x00aa00 });
const treeTrunkQuaternion = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
const treeIdentityQuaternion = new THREE.Quaternion();

// style.point.model.object (itowns' built-in point->3D-model instancing)
// ignores style.point.base_altitude entirely: pointsToInstancedMeshes()
// in itowns' Feature2Mesh.js positions instances from the raw, un-draped
// feature vertices, unlike featureToPoint() which is the only path that
// actually applies base_altitude. So instead of using model.object, we
// let itowns build its normal (but hidden) point sprite - which DOES get
// correctly terrain-draped via altitudeLine - and build our own trunk +
// canopy InstancedMesh from those already-correct positions here.
function buildTreeInstances(featureMesh) {
    const pointMeshes = [];
    featureMesh.traverse((obj) => {
        if (obj.isPoints && obj.feature) {
            pointMeshes.push(obj);
        }
    });

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();

    pointMeshes.forEach((obj) => {
        const positions = obj.geometry.attributes.position.array;
        const geometries = obj.feature.geometries;
        const count = geometries.length;

        const trunkMesh = new THREE.InstancedMesh(treeTrunkGeometry, treeTrunkMaterial, count);
        const canopyMesh = new THREE.InstancedMesh(treeCanopyGeometry, treeCanopyMaterial, count);

        for (let i = 0; i < count; i++) {
            const gx = positions[i * 3];
            const gy = positions[i * 3 + 1];
            const gz = positions[i * 3 + 2];
            const properties = geometries[i].properties;
            const trunkRadius = 2;
            const trunkHeight = hauteurfut_m_function(properties);
            const canopyRadius = rayoncouronne_m_function(properties);

            position.set(gx, gy, gz + trunkHeight / 2);
            scale.set(trunkRadius, trunkHeight, trunkRadius);
            matrix.compose(position, treeTrunkQuaternion, scale);
            trunkMesh.setMatrixAt(i, matrix);

            position.set(gx, gy, gz + trunkHeight - canopyRadius / 3);
            scale.set(canopyRadius, canopyRadius, canopyRadius);
            matrix.compose(position, treeIdentityQuaternion, scale);
            canopyMesh.setMatrixAt(i, matrix);
        }
        trunkMesh.instanceMatrix.needsUpdate = true;
        canopyMesh.instanceMatrix.needsUpdate = true;

        // Fully drop the point sprite (not just hide it) - otherwise every
        // tile carries its GPU buffers in addition to the trunk/canopy
        // InstancedMesh we just built from its (already correct) positions.
        const parent = obj.parent;
        parent.remove(obj);
        obj.geometry.dispose();
        parent.add(trunkMesh, canopyMesh);
    });
}

// Vegetation layer: alignment trees from Métropole de Lyon's WFS.
var wfsTreesSource = new itowns.WFSSource({
    url: 'https://download.data.grandlyon.com/wfs/grandlyon?',
    version: '2.0.0',
    typeName: 'metropole-de-lyon:abr_arbres_alignement.abrarbre',
    crs: 'EPSG:4326',
    ipr: 'Métropole de Lyon',
    format: 'application/json',
    extent: lyonExtent,
});

var wfsTreesLayer = new itowns.FeatureGeometryLayer('WFS Trees', {
    filter: acceptTree,
    source: wfsTreesSource,
    zoom: { min: 14 },
    onMeshCreated: buildTreeInstances,
    style: {
        point: {
            base_altitude: altitudeLine,
            color: colorTree,
            radius: radiusTree,
        }
    },
});

view.addLayer(wfsTreesLayer).then( (layer) => itownsDebug.GeometryDebug.createGeometryDebugUI(menuGlobe.gui, view, layer));

// parks layer: Lyon's public parks from Métropole de Lyon's WFS.
const parksSource = new itowns.FileSource({
    url: './layers/GeoJSON/parks.geojson',
    crs: 'EPSG:4326',
    format: 'application/json',
});

const parksLayer = new itowns.ColorLayer('parks', {
    name: 'parks',
    transparent: true,
    source: parksSource,
    style: {
        fill: {
            color: 'green',
            opacity: 0.5,
        },
        stroke: {
            color: 'white',
        },
    },
});

view.addLayer(parksLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));


const isochronesSource = new itowns.FileSource({
    url: './layers/GeoJSON/isochrones_parks_3857.geojson',
    crs: 'EPSG:3857',
    format: 'application/json',
});

const isochronesLayer = new itowns.ColorLayer('isochrones', {
    name: 'isochrones',
    transparent: true,
    source: isochronesSource,
    style: {
        fill: {
            color: properties => properties.color || 'blue',
            opacity: 0.5,
        },
        stroke: {
            color: 'white',
        },
    },
});

view.addLayer(isochronesLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe)); 


const isolinesSource = new itowns.FileSource({
    url: './layers/GeoJSON/isolines_parks_3857.geojson',
    crs: 'EPSG:3857',
    format: 'application/json',
});

const isolinesLayer = new itowns.ColorLayer('isolines', {
    name: 'isolines',
    transparent: true,
    source: isolinesSource,
    style: {
        fill: {
            color: properties => properties.color,
            opacity: 0.5,
        },
        stroke: {
            color: properties => properties.color || 'white',
            width: 5
        },
    },
});

view.addLayer(isolinesLayer).then(menuGlobe.addLayerGUI.bind(menuGlobe));

itownsDebug.createTileDebugUI(menuGlobe.gui, view);