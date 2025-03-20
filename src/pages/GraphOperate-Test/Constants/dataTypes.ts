interface CircuitNode {
    name: string;
    shape: string;
    properties: {
        load: string;
        low: string;
        input: string;
        output: string;
        class: string;
        evaluates: string;
        sets: string;
        DM_Gain: string;
        CMRR: string;
        PSRR: string;
        CM_gain: string;
    };
}

// 定义链路数据的接口类型
interface Link {
    source: string;
    target: string;
    properties: {
        label: string;
    };
}

