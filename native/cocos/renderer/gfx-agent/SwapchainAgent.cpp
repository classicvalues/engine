/****************************************************************************
 Copyright (c) 2020-2022 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

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
****************************************************************************/

#include "base/threading/MessageQueue.h"

#include "DeviceAgent.h"
#include "SwapchainAgent.h"
#include "gfx-agent/TextureAgent.h"

namespace cc {
namespace gfx {

SwapchainAgent::SwapchainAgent(Swapchain *actor)
: Agent<Swapchain>(actor) {
    _typedID            = actor->getTypedID();
    _preRotationEnabled = static_cast<SwapchainAgent *>(actor)->_preRotationEnabled;
}

SwapchainAgent::~SwapchainAgent() {
    ENQUEUE_MESSAGE_1(
        DeviceAgent::getInstance()->getMessageQueue(), SwapchainDestruct,
        actor, _actor,
        {
            CC_SAFE_DELETE(actor);
        });
}

void SwapchainAgent::doInit(const SwapchainInfo &info) {
    ENQUEUE_MESSAGE_2(
        DeviceAgent::getInstance()->getMessageQueue(), SwapchainInit,
        actor, getActor(),
        info, info,
        {
            actor->initialize(info);
        });

    DeviceAgent::getInstance()->getMessageQueue()->kickAndWait();

    auto *colorTexture = CC_NEW(TextureAgent(_actor->getColorTexture()));
    colorTexture->renounceOwnership();
    _colorTexture = colorTexture;

    auto *depthStencilTexture = CC_NEW(TextureAgent(_actor->getDepthStencilTexture()));
    depthStencilTexture->renounceOwnership();
    _depthStencilTexture = depthStencilTexture;

    SwapchainTextureInfo textureInfo;
    textureInfo.swapchain = this;
    textureInfo.format    = _actor->getColorTexture()->getFormat();
    textureInfo.width     = _actor->getWidth();
    textureInfo.height    = _actor->getHeight();
    initTexture(textureInfo, _colorTexture);

    textureInfo.format = _actor->getDepthStencilTexture()->getFormat();
    initTexture(textureInfo, _depthStencilTexture);

    _transform = _actor->getSurfaceTransform();
}

void SwapchainAgent::doDestroy() {
    _depthStencilTexture = nullptr;
    _colorTexture        = nullptr;

    ENQUEUE_MESSAGE_1(
        DeviceAgent::getInstance()->getMessageQueue(), SwapchainDestroy,
        actor, getActor(),
        {
            actor->destroy();
        });
}

void SwapchainAgent::doResize(uint32_t width, uint32_t height, SurfaceTransform transform) {
    auto *mq = DeviceAgent::getInstance()->getMessageQueue();

    ENQUEUE_MESSAGE_4(
        mq, SwapchainResize,
        actor, getActor(),
        width, width,
        height, height,
        transform, transform,
        {
            actor->resize(width, height, transform);
        });

    mq->kickAndWait();

    auto *colorTexture        = static_cast<TextureAgent *>(_colorTexture.get());
    auto *depthStencilTexture = static_cast<TextureAgent *>(_depthStencilTexture.get());
    colorTexture->_info.width = depthStencilTexture->_info.width = _actor->getWidth();
    colorTexture->_info.height = depthStencilTexture->_info.height = _actor->getHeight();

    _transform = _actor->getSurfaceTransform();
}

void SwapchainAgent::doDestroySurface() {
    ENQUEUE_MESSAGE_1(
        DeviceAgent::getInstance()->getMessageQueue(), SwapchaindestroySurface,
        actor, getActor(),
        {
            actor->destroySurface();
        });

    DeviceAgent::getInstance()->getMessageQueue()->kickAndWait();
}

void SwapchainAgent::doCreateSurface(void *windowHandle) {
    ENQUEUE_MESSAGE_2(
        DeviceAgent::getInstance()->getMessageQueue(), SwapchaincreateSurface,
        actor, getActor(),
        windowHandle, windowHandle,
        {
            actor->createSurface(windowHandle);
        });
    DeviceAgent::getInstance()->getMessageQueue()->kickAndWait();
}

} // namespace gfx
} // namespace cc
