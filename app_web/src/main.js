import { gltfInput } from './input.js';

import { GltfView } from 'gltf-viewer-source';

import { UIModel } from './logic/uimodel.js';
import { app } from './ui/ui.js';
import { Observable, Subject, from, merge } from 'rxjs';
import { mergeMap, filter, map, multicast } from 'rxjs/operators';
import { gltfModelPathProvider, fillEnvironmentWithPaths } from './model_path_provider.js';

async function main()
{
    const canvas = document.getElementById("canvas");
    const context = canvas.getContext("webgl2", { alpha: false, antialias: true });
    const ui = document.getElementById("app");
    const view = new GltfView(context);
    const resourceLoader = view.createResourceLoader();
    const state = view.createState();

    resourceLoader.initDracoLib();
    resourceLoader.initKtxLib();


    const pathProvider = new gltfModelPathProvider('assets/models/2.0/model-index.json');
    await pathProvider.initialize();
    const environmentPaths = fillEnvironmentWithPaths({
        "footprint_court_512": "Foodprint Court (512p)",
        "footprint_court": "Foodprint Court",
        "pisa": "Pisa courtyard nearing sunset, Italy",
        "doge2": "Courtyard of the Doge's palace",
        "ennis": "Dining room of the Ennis-Brown House",
        "field": "Field",
        "helipad": "Helipad Goldenhour",
        "papermill": "Papermill Ruins",
        "neutral": "Studio Neutral",
        "chromatic": "Studio Chromatic",
        "directional": "Studio Directional",
    }, "assets/environments/");

    const uiModel = new UIModel(app, pathProvider, environmentPaths);

    // whenever a new model is selected, load it and when complete pass the loaded gltf
    // into a stream back into the UI
    const gltfLoadedSubject = new Subject();
    const gltfLoadedMulticast = uiModel.model.pipe(
        mergeMap( (model) =>
        {
            return from(resourceLoader.loadGltf(model.mainFile, model.additionalFiles).then( (gltf) => {
                state.gltf = gltf;
                const defaultScene = state.gltf.scene;
                state.sceneIndex = defaultScene === undefined ? 0 : defaultScene;
                state.cameraIndex = undefined;
                const scene = state.gltf.scenes[state.sceneIndex];
                scene.applyTransformHierarchy(state.gltf);
                state.userCamera.aspectRatio = canvas.width / canvas.height;
                state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);

                // Try to start as many animations as possible without generating conficts.
                state.animationIndices = [];
                for (let i = 0; i < gltf.animations.length; i++)
                {
                    if (!gltf.nonDisjointAnimations(state.animationIndices).includes(i))
                    {
                        state.animationIndices.push(i);
                    }
                }
                state.animationTimer.start();

                return state;
            })
            );
        }),
        // transform gltf loaded observable to multicast observable to avoid multiple execution with multiple subscriptions
        multicast(gltfLoadedSubject)
    );

    uiModel.disabledAnimations(uiModel.activeAnimations.pipe(map(animationIndices => {
        // Disable all animations which are not disjoint to the current selection of animations.
        return state.gltf.nonDisjointAnimations(animationIndices);
    })));

    const sceneChangedSubject = new Subject();
    const sceneChangedObservable = uiModel.scene.pipe(map( newSceneIndex => {
        state.sceneIndex = newSceneIndex;
        state.cameraIndex = undefined;
        const scene = state.gltf.scenes[state.sceneIndex];
        scene.applyTransformHierarchy(state.gltf);
        state.userCamera.fitViewToScene(state.gltf, state.sceneIndex);
    }),
    multicast(sceneChangedSubject)
    );

    const statisticsUpdateObservableTemp = merge(
        gltfLoadedMulticast,
        sceneChangedObservable
    );

    const statisticsUpdateObservable = statisticsUpdateObservableTemp.pipe(
        map( (_) => view.gatherStatistics(state) )
    );

    const cameraExportChangedObservable = uiModel.cameraValuesExport.pipe( map(_ => {
        let camera = state.userCamera;
        if(state.cameraIndex !== undefined)
        {
            camera = state.gltf.cameras[state.cameraIndex];
        }
        const cameraDesc = camera.getDescription(state.gltf);
        return cameraDesc;
    }));
    cameraExportChangedObservable.subscribe( cameraDesc => {
        uiModel.copyToClipboard(JSON.stringify(cameraDesc));
    });

    uiModel.captureCanvas.subscribe( () => {
        view.renderFrame(state, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL();

        var element = document.createElement('a');
        element.setAttribute('href', dataURL);
        element.setAttribute('download', "capture.png");

        element.style.display = 'none';
        document.body.appendChild(element);

        element.click();

        document.body.removeChild(element);
    });

    uiModel.camera.pipe(filter(camera => camera === -1)).subscribe( () => {
        state.cameraIndex = undefined;
    });
    uiModel.camera.pipe(filter(camera => camera !== -1)).subscribe( camera => {
        state.cameraIndex = camera;
    });

    uiModel.variant.subscribe( variant => {
        state.variant = variant;
    });

    uiModel.tonemap.subscribe( tonemap => {
        state.renderingParameters.toneMap = tonemap;
    });

    uiModel.debugchannel.subscribe( debugchannel => {
        state.renderingParameters.debugOutput = debugchannel;
    });

    uiModel.skinningEnabled.subscribe( skinningEnabled => {
        state.renderingParameters.skinning = skinningEnabled;
    });

    uiModel.exposurecompensation.subscribe( exposurecompensation => {
        state.renderingParameters.exposure = Math.pow(2, exposurecompensation);
    });

    uiModel.morphingEnabled.subscribe( morphingEnabled => {
        state.renderingParameters.morphing = morphingEnabled;
    });

    uiModel.clearcoatEnabled.subscribe( clearcoatEnabled => {
        state.renderingParameters.clearcoat = clearcoatEnabled;
    });
    uiModel.sheenEnabled.subscribe( sheenEnabled => {
        state.renderingParameters.sheen = sheenEnabled;
    });
    uiModel.transmissionEnabled.subscribe( transmissionEnabled => {
        state.renderingParameters.transmission = transmissionEnabled;
    });

    uiModel.iblEnabled.subscribe( iblEnabled => {
        state.renderingParameters.useIBL = iblEnabled;
    });

    uiModel.renderEnvEnabled.subscribe( renderEnvEnabled => {
        state.renderingParameters.renderEnvironmentMap = renderEnvEnabled;
    });
    uiModel.blurEnvEnabled.subscribe( blurEnvEnabled => {
        state.renderingParameters.blurEnvironmentMap = blurEnvEnabled;
    });

    uiModel.punctualLightsEnabled.subscribe( punctualLightsEnabled => {
        state.renderingParameters.usePunctual = punctualLightsEnabled;
    });

    uiModel.environmentEnabled.subscribe( environmentEnabled => {
        state.renderingParameters.environmentBackground = environmentEnabled;
    });

    uiModel.environmentRotation.subscribe( environmentRotation => {
        switch (environmentRotation)
        {
        case "+Z":
            state.renderingParameters.environmentRotation = 90.0;
            break;
        case "-X":
            state.renderingParameters.environmentRotation = 180.0;
            break;
        case "-Z":
            state.renderingParameters.environmentRotation = 270.0;
            break;
        case "+X":
            state.renderingParameters.environmentRotation = 0.0;
            break;
        }
    });


    uiModel.clearColor.subscribe( clearColor => {
        state.renderingParameters.clearColor = clearColor;
    });

    uiModel.animationPlay.subscribe( animationPlay => {
        if(animationPlay)
        {
            state.animationTimer.unpause();
        }
        else
        {
            state.animationTimer.pause();
        }
    });

    uiModel.activeAnimations.subscribe( animations => {
        state.animationIndices = animations;
    });

    uiModel.hdr.subscribe( hdrFile => {
        resourceLoader.loadEnvironment(hdrFile).then( (environment) => {
            state.environment = environment;
        });
    });

    uiModel.attachGltfLoaded(gltfLoadedMulticast);
    uiModel.updateStatistics(statisticsUpdateObservable);
    const sceneChangedStateObservable = uiModel.scene.pipe(map( newSceneIndex => state));
    uiModel.attachCameraChangeObservable(sceneChangedStateObservable);
    gltfLoadedMulticast.connect();

    const input = new gltfInput(canvas);
    input.setupGlobalInputBindings(document);
    input.setupCanvasInputBindings(canvas);
    input.onRotate = (deltaX, deltaY) =>
    {
        if (state.cameraIndex === undefined)
        {
            state.userCamera.orbit(deltaX, deltaY);
        }
    };
    input.onPan = (deltaX, deltaY) =>
    {
        if (state.cameraIndex === undefined)
        {
            state.userCamera.pan(deltaX, deltaY);
        }
    };
    input.onZoom = (delta) =>
    {
        if (state.cameraIndex === undefined)
        {
            state.userCamera.zoomBy(delta);
        }
    };

    // configure the animation loop
    const update = () =>
    {
        canvas.width = window.innerWidth - ui.getBoundingClientRect().width;
        canvas.height = canvas.clientHeight;

        view.renderFrame(state, canvas.width, canvas.height);
        window.requestAnimationFrame(update);
    };

    // After this start executing animation loop.
    window.requestAnimationFrame(update);
}

export { main };
