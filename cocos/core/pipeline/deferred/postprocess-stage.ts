/*
 Copyright (c) Huawei Technologies Co., Ltd. 2020-2021.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated engine source code (the "Software"), a limited,
 worldwide, royalty-free, non-assignable, revocable and non-exclusive license
 to use Cocos Creator solely to develop games on your target platforms. You shall
 not use Cocos Creator software for developing other software or tools that's
 used for developing games. You are not granted to publish, distribute,
 sublicense, and/or sell copies of Cocos Creator.

 The software or tools in this License Agreement are licensed, not sold.
 Xiamen Yaji Software Co., Ltd. reserves all rights not expressly granted to you.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 */

/**
 * @category pipeline
 */
import { ccclass, displayOrder, type, serializable } from 'cc.decorator';
import { Camera } from '../../renderer/scene';
import { SetIndex } from '../define';
import { Color, Rect, PipelineState, ClearFlagBit } from '../../gfx';
import { IRenderStageInfo, RenderStage } from '../render-stage';
import { CommonStagePriority } from '../enum';
import { Material } from '../../assets/material';
import { PipelineStateManager } from '../pipeline-state-manager';
import { RenderQueueDesc } from '../pipeline-serialization';
import { renderProfiler } from '../pipeline-funcs';
import { RenderFlow, RenderPipeline } from '..';
import { UIPhase } from '../ui-phase';
import { DeferredPipelineSceneData } from './deferred-pipeline-scene-data';

const colors: Color[] = [new Color(0, 0, 0, 1)];

/**
  * @en The postprocess render stage
  * @zh 后处理渲染阶段。
  */
@ccclass('PostProcessStage')
export class PostProcessStage extends RenderStage {
    public static initInfo: IRenderStageInfo = {
        name: 'PostProcessStage',
        priority: CommonStagePriority.POST_PROCESS,
        tag: 0,
    };

    @type(Material)
    @serializable
    @displayOrder(3)
    private _postProcessMaterial: Material | null = null;

    @type([RenderQueueDesc])
    @serializable
    @displayOrder(2)
    private renderQueues: RenderQueueDesc[] = [];

    private _renderArea = new Rect();
    private declare _uiPhase: UIPhase;

    constructor () {
        super();
        this._uiPhase = new UIPhase();
    }

    public initialize (info: IRenderStageInfo): boolean {
        super.initialize(info);
        return true;
    }

    public activate (pipeline: RenderPipeline, flow: RenderFlow) {
        super.activate(pipeline, flow);
        if (this._postProcessMaterial) { (pipeline.pipelineSceneData as DeferredPipelineSceneData).postprocessMaterial = this._postProcessMaterial; }
        this._uiPhase.activate(pipeline);
    }

    public destroy () {
    }

    public render (camera: Camera) {
        const pipeline = this._pipeline;
        const device = pipeline.device;
        const sceneData = pipeline.pipelineSceneData;
        const cmdBuff = pipeline.commandBuffers[0];
        pipeline.pipelineUBO.updateCameraUBO(camera);

        const vp = camera.viewport;
        this._renderArea.x = vp.x * camera.window.width;
        this._renderArea.y = vp.y * camera.window.height;
        this._renderArea.width = vp.width * camera.window.width;
        this._renderArea.height = vp.height * camera.window.height;
        const renderData = pipeline.getPipelineRenderData();
        const framebuffer = camera.window.framebuffer;
        const renderPass = pipeline.getRenderPass(camera.clearFlag, framebuffer);

        if (camera.clearFlag & ClearFlagBit.COLOR) {
            colors[0].x = camera.clearColor.x;
            colors[0].y = camera.clearColor.y;
            colors[0].z = camera.clearColor.z;
        }

        colors[0].w = camera.clearColor.w;

        cmdBuff.beginRenderPass(renderPass, framebuffer, this._renderArea,
            colors, camera.clearDepth, camera.clearStencil);
        cmdBuff.bindDescriptorSet(SetIndex.GLOBAL, pipeline.descriptorSet);
        // Postprocess
        const builtinPostProcess = (sceneData as DeferredPipelineSceneData).postprocessMaterial;
        const pass = builtinPostProcess.passes[0];
        const shader = pass.getShaderVariant();

        if (pipeline.bloomEnabled) {
            pass.descriptorSet.bindTexture(0, renderData.bloom!.combineTex);
        } else {
            pass.descriptorSet.bindTexture(0, renderData.outputRenderTargets[0]);
        }
        pass.descriptorSet.bindSampler(0, renderData.sampler);
        pass.descriptorSet.update();

        cmdBuff.bindDescriptorSet(SetIndex.MATERIAL, pass.descriptorSet);

        const inputAssembler = camera.window.swapchain ? pipeline.quadIAOnscreen : pipeline.quadIAOffscreen;
        let pso: PipelineState | null = null;
        if (pass != null && shader != null && inputAssembler != null) {
            pso = PipelineStateManager.getOrCreatePipelineState(device, pass, shader, renderPass, inputAssembler);
        }

        const renderObjects = pipeline.pipelineSceneData.renderObjects;
        if (pso != null && renderObjects.length > 0) {
            cmdBuff.bindPipelineState(pso);
            cmdBuff.bindInputAssembler(inputAssembler);
            cmdBuff.draw(inputAssembler);
        }
        this._uiPhase.render(camera, renderPass);
        renderProfiler(device, renderPass, cmdBuff, pipeline.profiler, camera);

        cmdBuff.endRenderPass();
    }
}
